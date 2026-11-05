// Shared test setup. Node tests skip the DOM parts; jsdom tests get matchers, cleanup and <dialog>.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

if (typeof window !== "undefined") {
  afterEach(() => cleanup());

  // jsdom has <dialog> but not showModal()/close(). Enough of both for our Dialog component.
  const proto = window.HTMLDialogElement?.prototype;
  if (proto && !proto.showModal) {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}
