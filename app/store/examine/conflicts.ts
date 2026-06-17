import type { ConflictListItem } from '~/types'
import { getConflicts } from '~/util/namex-api'
import { highlightWord } from '~/util/html/highlight'


export const useConflicts = defineStore('conflicts', () => {
  const exactMatches = ref<Array<ConflictListItem>>([])
  const phoneticMatches = ref<Array<ConflictListItem>>([])
  const synonymMatches = ref<Array<ConflictListItem>>([])
  const cobrsPhoneticMatches = ref<Array<ConflictListItem>>([])

  const loading = ref(false)

  const selectedConflicts = ref<Array<ConflictListItem>>([])
  const comparedConflicts = ref<Array<ConflictListItem>>([])
  const prevSelectedConflicts = ref<Array<ConflictListItem>>([])
  const prevComparedConflicts = ref<Array<ConflictListItem>>([])
  const autoAdd = ref(true)

  /** Flattened array of every `ConflictList` across all buckets. */
  const lists = computed<Array<ConflictList>>(() =>
    [
      phoneticMatches.value,
      synonymMatches.value,
      cobrsPhoneticMatches.value,
    ].flat()
  )

  /** List of all `ConflictList`s that contain items within them. */
  const nonEmptyLists = computed(() =>
    lists.value.filter((list) => list.children.length > 0)
  )

  /** The first `ConflictListItem` among every `ConflictList` across all buckets. */
  const firstConflictItem = computed(() =>
    [...exactMatches.value, ...phoneticMatches.value, ...synonymMatches.value, ...cobrsPhoneticMatches.value].at(0)
  )

  function isConflictSelected(conflict: ConflictListItem) {
    const conflictsList = autoAdd.value
      ? selectedConflicts.value
      : comparedConflicts.value
    return conflictsList.map((c) => c.nrNumber).includes(conflict.nrNumber)
  }

  /** If the given conflict is not selected, selects it. Otherwise, deselects it. */
  function toggleConflict(conflict: ConflictListItem) {
    if (isConflictSelected(conflict)) {
      deselectConflict(conflict)
    } else {
      selectConflict(conflict)
    }
  }

  async function retrieveConflicts(query: string): Promise<[ConflictListItem[], ConflictListItem[], ConflictListItem[], ConflictListItem[], any[]]> {
    const resp = await getConflicts(query)
    if (!resp.ok) throw new Error('Unable to retrieve exact matches')
    const json = await resp.json()
    const names: any[] = json?.names || []
    const exact = parseExactMatches(json?.exactNames || [])
    const phonetic = parseSynonymMatches(names.filter((r) => r.highlighting?.synonyms?.length > 0))
    const synonym = parseSynonymMatches(names.filter((r) => r.highlighting?.stems?.length > 0))
    const cobrs: ConflictListItem[] = []
    const histories = json?.histories
    return [exact, phonetic, synonym, cobrs, histories]
  }

  function parseExactMatches(exactMatches: Array<any>): Array<ConflictListItem> {
    return exactMatches.map((match) => {
      return {
        text: match.name,
        highlightedText: match.name,
        nrNumber: match.parent_id,
        startDate: match.parent_start_date,
        jurisdiction: match.parent_jurisdiction,
        source: match.parent_type,
        ui: {
          focused: false,
          open: false,
        },
      }
    })
  }

  function parseSynonymMatches(synonymMatches: Array<any>): Array<ConflictListItem> {
    return synonymMatches.map((match) => {
      const highlightedName = highlightNameChoices(match)
      return {
        text: match.name,
        highlightedText: highlightedName,
        nrNumber: match.parent_id,
        startDate: match.parent_start_date,
        jurisdiction: match.parent_jurisdiction,
        source: match.parent_type,
        ui: {
          focused: false,
          open: false,
        },
      }
    })
  }

  function highlightNameChoices(entry: any): string {
    const name: string = entry?.name ?? ''
    const highlighting = entry?.highlighting

    // If we have nothing to highlight, keep original text intact
    if (!name || !highlighting) {
      return name
    }

    // Split into word and whitespace tokens so we preserve spacing exactly
    const tokens = name.split(/(\s+)/)

    const exactList: string[] = Array.isArray(highlighting.exact) ? highlighting.exact : []
    const synonymList: string[] = Array.isArray(highlighting.synonyms) ? highlighting.synonyms : []
    const stemList: string[] = Array.isArray(highlighting.stems) ? highlighting.stems : []

    const applyFirstMatchingCategory = (word: string): string => {
      // exact > synonym > stem
      for (const exact of exactList) {
        const highlighted = highlightWord(exact, word, 'exact-highlight')
        if (highlighted !== word) return highlighted
      }

      for (const synonym of synonymList) {
        const highlighted = highlightWord(synonym, word, 'synonym-highlight')
        if (highlighted !== word) return highlighted
      }

      for (const stem of stemList) {
        const highlighted = highlightWord(stem, word, 'stem-highlight')
        if (highlighted !== word) return highlighted
      }

      return word
    }

    return tokens
      .map((token) => (token.trim().length === 0 ? token : applyFirstMatchingCategory(token)))
      .join('')
  }

  async function initialize(searchQuery: string, exactPhrase: string) {
    loading.value = true
    resetConflictLists()
    try {
      const [exact, phonetic, synonym, cobrs, histories] = await retrieveConflicts(searchQuery)
      exactMatches.value = exact
      phoneticMatches.value = phonetic
      synonymMatches.value = synonym
      cobrsPhoneticMatches.value = cobrs
      return histories
    } catch (e) {
      resetMatches()
      throw e
    } finally {
      loading.value = false
    }
  }

  function clearSelectedConflicts() {
    selectedConflicts.value = []
  }

  function resetMatches() {
    exactMatches.value = []
    phoneticMatches.value = []
    synonymMatches.value = []
    cobrsPhoneticMatches.value = []
    loading.value = false
  }

  function resetConflictLists() {
    clearSelectedConflicts()
    comparedConflicts.value = []
  }

  function selectConflict(conflict: ConflictListItem) {
    comparedConflicts.value.push(conflict)
    if (autoAdd.value) {
      selectedConflicts.value.push(conflict)
    }
  }

  function deselectConflict(conflict: ConflictListItem) {
    const notConflict = (c: ConflictListItem) =>
      c.nrNumber !== conflict.nrNumber
    selectedConflicts.value = selectedConflicts.value.filter(notConflict)
    comparedConflicts.value = comparedConflicts.value.filter(notConflict)
  }

  /** Keep compared conflicts synchronized with selected conflicts when auto add is enabled. */
  function syncSelectedAndComparedConflicts() {
    if (autoAdd.value) {
      comparedConflicts.value = selectedConflicts.value.slice()
    }
  }

  /** Reset selectedConflicts and comparedConflicts and save existing data */
  function disableAutoAdd() {
    if (!autoAdd.value) {
      const initialRun = (prevSelectedConflicts.value.length === 0 && prevComparedConflicts.value.length === 0)
      for (const conflict of selectedConflicts.value) {
        if (initialRun) {
          prevSelectedConflicts.value.push(conflict)
          prevComparedConflicts.value.push(conflict)
        }
        const notConflict = (c: ConflictListItem) =>
          c.nrNumber !== conflict.nrNumber
        selectedConflicts.value = selectedConflicts.value.filter(notConflict)
        comparedConflicts.value = comparedConflicts.value.filter(notConflict)
      }
    }
  }

  /** Reassign selectedConflicts and comparedConflicts */
  function enableAutoAdd() {
    if (autoAdd.value) {
      selectedConflicts.value = prevSelectedConflicts.value
      comparedConflicts.value = prevComparedConflicts.value
    }
  }

  return {
    initialize,
    exactMatches,
    phoneticMatches,
    synonymMatches,
    cobrsPhoneticMatches,
    selectedConflicts,
    comparedConflicts,
    loading,
    isConflictSelected,
    toggleConflict,
    resetMatches,
    clearSelectedConflicts,
    resetConflictLists,
    selectConflict,
    deselectConflict,
    disableAutoAdd,
    enableAutoAdd,
    autoAdd,
    firstConflictItem,
    syncSelectedAndComparedConflicts
  }
})
