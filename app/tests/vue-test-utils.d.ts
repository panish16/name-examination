import { BaseWrapper } from '@vue/test-utils';
import { ComponentPublicInstance } from 'vue';

declare module '@vue/test-utils' {
  interface DOMWrapper<NodeType extends Node> {
    findWithText(text: string): BaseWrapper<Node>;
  }

  interface VueWrapper<VM = unknown, T extends ComponentPublicInstance = VM & ComponentPublicInstance> {
    findWithText(text: string): BaseWrapper<Node>;
  }
}
