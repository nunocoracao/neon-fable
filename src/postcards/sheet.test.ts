import { describe, expect, it } from "vitest";
import { decodePng, digest, encodePng } from "./png";
import {
  cellLabel,
  MAX_CELLS_PER_SHEET,
  paginate,
  renderSheet,
  sheetSize,
  wrapLabel,
  type SheetCell,
  type SheetSpec,
} from "./sheet";
import { allGridSheets } from "./sheets";

/**
 * A fixture sheet, not real art: this pins the *pipeline* — layout,
 * labelling, palette resolution, PNG encoding — so re-authoring a
 * sprite must not turn it red. If this hash moves, something about how
 * postcards are made moved, and that is exactly what wants noticing.
 */
const FIXTURE_CELLS: readonly SheetCell[] = [
  { id: "flat", frames: [["gg", "gg"]] },
  { id: "two frame strip", frames: [["g.", ".g"], [".g", "g."]] },
  { id: "with shadow", frames: [["zz9", "9.z"]] },
  {
    id: "a deliberately long identifier that has to wrap onto more lines",
    frames: [["jjjj", "kkkk", "llll", "jjjj"]],
  },
];

const FIXTURE: SheetSpec = {
  name: "fixture",
  title: "FIXTURE",
  note: "pins the pipeline, not the art",
  cells: FIXTURE_CELLS,
};

describe("wrapLabel", () => {
  it("breaks on spaces where it can", () => {
    expect(wrapLabel("enemy scrap runner", 96, 2)).toEqual([
      "enemy scrap",
      "runner",
    ]);
  });

  it("breaks inside a word that cannot fit at all", () => {
    expect(wrapLabel("abcdefghij", 24, 2)).toEqual(["abc", "def", "ghi", "j"]);
  });

  it("never returns nothing", () => {
    expect(wrapLabel("", 100, 2)).toEqual([""]);
  });
});

describe("paginate", () => {
  it("leaves a short sheet alone", () => {
    expect(paginate(FIXTURE)).toEqual([FIXTURE]);
  });

  it("numbers the pages of a long one", () => {
    const long = {
      ...FIXTURE,
      cells: Array.from({ length: MAX_CELLS_PER_SHEET * 2 + 1 }, (_, i) => ({
        id: `cell ${i}`,
        frames: [["g"]],
      })),
    };
    const pages = paginate(long);
    expect(pages.map((page) => page.name)).toEqual([
      "fixture-01",
      "fixture-02",
      "fixture-03",
    ]);
    expect(pages[0]?.title).toBe("FIXTURE (1/3)");
    expect(pages.reduce((n, page) => n + page.cells.length, 0)).toBe(
      long.cells.length,
    );
  });
});

describe("the postcard pipeline", () => {
  it("renders the fixture at a fixed size", () => {
    const fb = renderSheet(FIXTURE);
    expect({ width: fb.width, height: fb.height }).toEqual(sheetSize(FIXTURE));
    expect({ width: fb.width, height: fb.height }).toEqual({
      width: 1952,
      height: 155,
    });
  });

  it("encodes a PNG that decodes back to the same pixels", () => {
    const fb = renderSheet(FIXTURE);
    const png = encodePng({ width: fb.width, height: fb.height, data: fb.data });
    const back = decodePng(png);
    expect(back.width).toBe(fb.width);
    expect(back.height).toBe(fb.height);
    expect(digest(back.data)).toBe(digest(fb.data));
  });

  it("produces the same pixels every run", () => {
    const once = renderSheet(FIXTURE);
    const twice = renderSheet(FIXTURE);
    expect(digest(twice.data)).toBe(digest(once.data));
    expect(digest(once.data)).toBe("4697447db84e365e");
  });
});

describe("the sweep", () => {
  it("covers every art family with uniquely named sheets", () => {
    const sheets = allGridSheets();
    const names = sheets.map((sheet) => sheet.name);
    expect(new Set(names).size).toBe(names.length);
    for (const family of [
      "art-tiles",
      "art-props",
      "art-interactables",
      "art-setpieces",
      "art-drones",
      "art-mechs",
      "art-bodies",
      "art-attacks",
      "art-reactions",
      "art-effects",
      "art-abilityEffects",
      "art-statusMarkers",
      "character-matrix",
      "character-walk",
      "gear",
      "roster",
      "portrait-catalog",
      "portrait-cast",
    ]) {
      expect(names.some((name) => name.startsWith(family))).toBe(true);
    }
  });

  it("labels every cell and gives every cell at least one frame", () => {
    for (const sheet of allGridSheets()) {
      expect(sheet.cells.length).toBeGreaterThan(0);
      expect(sheet.cells.length).toBeLessThanOrEqual(MAX_CELLS_PER_SHEET);
      for (const cell of sheet.cells) {
        expect(cell.id.length).toBeGreaterThan(0);
        expect(cell.frames.length).toBeGreaterThan(0);
        for (const frame of cell.frames) expect(frame.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("cells drawn at the finer density", () => {
  const coarse: SheetCell = { id: "post", frames: [["44", "44"]] };
  const dense: SheetCell = {
    id: "post",
    frames: [["4444", "4444", "4444", "4444"]],
    density: 2,
  };

  it("lands at the same size as the 1x art beside it", () => {
    const size = (cell: SheetCell) =>
      sheetSize({ name: "s", title: "T", cells: [cell] });
    expect(size(dense)).toEqual(size(coarse));
  });

  it("says which cells have moved and leaves the rest unlabelled", () => {
    expect(cellLabel(coarse)).toBe("post");
    expect(cellLabel(dense)).toBe("post [d2]");
  });

  it("never drops pixels to make a cell fit", () => {
    // A sheet rendered at 1 art pixel per sheet pixel cannot halve again.
    const tiny = sheetSize({ name: "s", title: "T", cells: [dense], scale: 1 });
    expect(tiny.width).toBeGreaterThan(0);
    expect(tiny.height).toBeGreaterThan(0);
  });
});
