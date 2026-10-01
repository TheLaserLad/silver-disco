import { Namespace } from "socket.io";

let chatNamespace: Namespace | null = null;

export function setChatNamespace(nsp: Namespace): void {
  chatNamespace = nsp;
}

export function getChatNamespace(): Namespace | null {
  return chatNamespace;
}
