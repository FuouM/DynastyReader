import { describe, expect, it } from "vitest";
import { createRoot } from "solid-js";
import { ReaderSession } from "../../src/reader/reader-session";

describe("reader/reader-session - zoom controls", () => {
  it("rejects zoom when fit mode is width", () => {
    createRoot((dispose) => {
      const session = new ReaderSession({ view: "reader", chapterPermalink: "test-ch" });
      session.setFitMode("width");
      expect(session.fitMode()).toBe("width");
      expect(session.zoomScale()).toBe(1.0);

      session.zoomIn();
      expect(session.zoomScale()).toBe(1.0);
      expect(session.fitMode()).toBe("width");

      session.zoomOut();
      expect(session.zoomScale()).toBe(1.0);

      session.zoomByFactor(1.5);
      expect(session.zoomScale()).toBe(1.0);
      expect(session.fitMode()).toBe("width");

      session.applyPinchZoom(2.0);
      expect(session.zoomScale()).toBe(1.0);
      expect(session.fitMode()).toBe("width");

      dispose();
    });
  });

  it("rejects zoom when fit mode is height", () => {
    createRoot((dispose) => {
      const session = new ReaderSession({ view: "reader", chapterPermalink: "test-ch" });
      session.setFitMode("height");
      expect(session.fitMode()).toBe("height");
      expect(session.zoomScale()).toBe(1.0);

      session.zoomIn();
      expect(session.zoomScale()).toBe(1.0);

      session.zoomByFactor(2.0);
      expect(session.zoomScale()).toBe(1.0);
      expect(session.fitMode()).toBe("height");

      dispose();
    });
  });

  it("allows zoom operations only when fit mode is original", () => {
    createRoot((dispose) => {
      const session = new ReaderSession({ view: "reader", chapterPermalink: "test-ch" });
      session.setFitMode("original");
      expect(session.fitMode()).toBe("original");
      expect(session.zoomScale()).toBe(1.0);

      session.zoomIn();
      expect(session.zoomScale()).toBe(1.1);

      session.zoomOut();
      expect(session.zoomScale()).toBe(1.0);

      session.zoomByFactor(1.5);
      expect(session.zoomScale()).toBeCloseTo(1.5, 4);

      session.applyPinchZoom(2.2);
      expect(session.zoomScale()).toBeCloseTo(2.2, 4);

      session.resetZoom();
      expect(session.zoomScale()).toBe(1.0);

      // Clamps max zoom at 4.0
      session.applyPinchZoom(10.0);
      expect(session.zoomScale()).toBe(4.0);

      // Clamps min zoom at 0.25
      session.applyPinchZoom(0.05);
      expect(session.zoomScale()).toBe(0.25);

      dispose();
    });
  });

  it("resets zoom scale to 1.0 when switching away from original fit mode", () => {
    createRoot((dispose) => {
      const session = new ReaderSession({ view: "reader", chapterPermalink: "test-ch" });
      session.setFitMode("original");
      session.applyPinchZoom(2.5);
      expect(session.zoomScale()).toBe(2.5);

      session.setFitMode("width");
      expect(session.fitMode()).toBe("width");
      expect(session.zoomScale()).toBe(1.0);

      session.setFitMode("original");
      session.applyPinchZoom(3.0);
      session.setFitMode("height");
      expect(session.fitMode()).toBe("height");
      expect(session.zoomScale()).toBe(1.0);

      dispose();
    });
  });
});
