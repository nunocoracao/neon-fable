import type { StoryArc } from "../../narrative/types";

/**
 * What the lattice opened.
 *
 * Two scenes, and neither is reachable by walking. Each belongs to a
 * fixture a Breach run re-pointed: cut the boards' consignment register
 * and the gallery locker's hasp opens for you; put an instruction into
 * the quays' lockgate cabinet and the hoists walk the salvage cage up
 * off the strand. The re-pointing is ordinary map dressing keyed on the
 * flag the breach wrote (see ../mapDressing.ts), so the district is
 * different the next time you come down the stair and never under your
 * feet mid-scene.
 *
 * Both are third keys, never the only one. The locker still opens to
 * shoulders or to a talked hasp, and the cage still comes up for a back
 * or a set of gills — a lockout at a terminal costs a player this route
 * and nothing that is on the story's spine.
 *
 * Each pays once. The fixtures' own flags (`market-locker`,
 * `quays-cage`) are what the authored keys already write, so a locker
 * emptied by hand has nothing left in it for a breach and vice versa —
 * and the chains that read those flags later (see ./underWaterline.ts)
 * cannot tell which key was used, which is the point.
 *
 * This arc is a bundle of doorways rather than a thread: neither scene
 * leads to the other, so both are declared as ways in and reachability
 * validates against how the world actually opens them.
 */
export const breachArc: StoryArc = {
  id: "breach",
  title: "What the Lattice Opened",
  entryNodeId: "bz-market-locker",
  entryNodeIds: ["bz-quays-cage"],
  nodes: [
    {
      id: "bz-market-locker",
      text:
        "The hasp is open. Not forced — released, the way a hasp is " +
        "meant to be, because somewhere under the gallery boards the " +
        "market's own register decided this locker's week was up and " +
        "told the lock so. The door has swung a hand's width and stopped " +
        "against the scaffold, and the aisle behind you has not looked " +
        "up once.",
      location: "vertical-market:gallery",
      choices: [
        {
          id: "cut-take",
          label: "Open it the rest of the way and take what the week left.",
          target: "bz-market-locker-open",
          // A locker somebody has already emptied — by shoulders, by a
          // talked hasp, or by this — has nothing more in it.
          requirements: [{ type: "flag-unset", key: "market-locker" }],
          effects: [
            { type: "add-item", itemId: "con-field-kit" },
            { type: "add-item", itemId: "dye-rust-vigil" },
            { type: "credits", amount: 20 },
            { type: "set-flag", key: "market-locker", value: "cut" },
          ],
          reactions: ["salvage"],
        },
        {
          id: "cut-leave",
          label: "Push the door shut and get back in the crowd.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "bz-market-locker-open",
      text:
        "A field kit still in its seal, a tin of the amber the boards " +
        "crews wore the year the scaffolds went up, and a hand of loose " +
        "chits somebody was keeping out of a ledger. Nothing anybody is " +
        "coming back for. You close the door on it and leave the hasp " +
        "hanging the way the register left it.",
      location: "vertical-market:gallery",
      choices: [
        {
          id: "cut-done",
          label: "Back into the aisle.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "bz-quays-cage",
      text:
        "The hoist over the strand has woken up. It does it politely — a " +
        "shudder, a wind of slack out of the drum, and then the chain " +
        "starts coming in hand over hand out of the basin like something " +
        "remembering how. The cage clears the water at an angle, dumps a " +
        "season of silt back where it came from, and swings there " +
        "streaming under the barge's stern.",
      location: "flooded-quays:strand",
      comments: [
        {
          companionId: "vesper",
          text:
            "\"Twelve years that gear's been dead.\" She watches the " +
            "chain come in and does not blink. \"Twelve years, and it " +
            "was waiting to be asked.\"",
        },
      ],
      choices: [
        {
          id: "winch-take",
          label: "Get the door open while it is still swinging.",
          target: "bz-quays-cage-open",
          requirements: [{ type: "flag-unset", key: "quays-cage" }],
          effects: [
            { type: "add-item", itemId: "con-trauma-patch" },
            { type: "credits", amount: 30 },
            { type: "set-flag", key: "quays-cage", value: "winched" },
          ],
          reactions: ["salvage"],
        },
        {
          id: "winch-leave",
          label: "Let the drum run back out and put it where it was.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "bz-quays-cage-open",
      text:
        "Under the silt: a trauma kit in a diver's dry-bag, still good, " +
        "and a consignment tag with a number on it and no name. Somebody " +
        "parked a haul here meaning to come back up for it in the " +
        "morning. You put the tag in your pocket, because a number is a " +
        "person, and let the cage down easy.",
      location: "flooded-quays:strand",
      choices: [
        {
          id: "winch-done",
          label: "Back onto the strand.",
          effects: [{ type: "end" }],
        },
      ],
    },
  ],
};
