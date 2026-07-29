import type { StoryArc } from "../../narrative/types";

/**
 * The Chrome Chapel: Cinder Row's stylist parlor, run out of a
 * decommissioned confessional booth by Vesper, who treats reinvention
 * as a sacrament. A small hub-service arc — flavor, a creed, and the
 * chair. The "open-stylist" choices close the dialogue while the
 * re-style screen is up and resume at their target node afterward;
 * payment happens on the screen's confirm, so sitting down (and
 * standing back up unchanged) is free.
 *
 * The fee quoted in the choice labels must match RESTYLE_PRICE in
 * src/data/stylist.ts — a test keeps them in step.
 */
export const chapelArc: StoryArc = {
  id: "chrome-chapel",
  title: "The Chrome Chapel",
  entryNodeId: "chapel-door",
  nodes: [
    {
      id: "chapel-door",
      speaker: "Vesper",
      text:
        "The Chrome Chapel is a gutted confessional rebuilt in mirror-steel: " +
        "a barber's chair where the altar was, votive LEDs guttering cyan. " +
        "Vesper circles you once, shears clicking a slow blessing. \"Every " +
        "face walks in a confession and walks out a testimony. What are we " +
        "absolving today — the hair, the ink, or the whole sermon?\"",
      location: "cinder-row:chrome-chapel",
      choices: [
        {
          id: "sit-chair",
          label: "Take the chair. \"Change my look.\" (40 cr)",
          target: "chapel-blessing",
          effects: [{ type: "open-stylist" }],
        },
        {
          id: "ask-creed",
          label: "Ask what a chapel wants with a barber's chair.",
          target: "chapel-creed",
        },
        {
          id: "leave",
          label: "Leave the mirrors to their arguments.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "chapel-creed",
      speaker: "Vesper",
      text:
        "\"The corps sell you a face and call it identity. I run the only " +
        "parish in Cinder Row where you choose your own.\" Vesper taps the " +
        "chair's headrest twice, like a knuckle on scripture. \"Bone and " +
        "skin stay as the street made them — that's the person, and I " +
        "don't rewrite people. Everything hanging off them is style, and " +
        "style is between you and the mirror.\"",
      location: "cinder-row:chrome-chapel",
      choices: [
        {
          id: "back-to-chair",
          label: "\"Preach. Now about my hair.\"",
          target: "chapel-door",
        },
        {
          id: "creed-leave",
          label: "Leave them to the faith.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "chapel-blessing",
      speaker: "Vesper",
      text:
        "Vesper snaps the cape away and turns the chair to face the tall " +
        "mirror. \"The glass doesn't lie and neither do I. Go on — let " +
        "Cinder Row get a look at the new testimony. Chair's always warm " +
        "if the sermon needs another draft.\"",
      location: "cinder-row:chrome-chapel",
      choices: [
        {
          id: "sit-again",
          label: "Settle back into the chair. (40 cr)",
          target: "chapel-blessing",
          effects: [{ type: "open-stylist" }],
        },
        {
          id: "blessing-leave",
          label: "Step out into the neon.",
          effects: [{ type: "end" }],
        },
      ],
    },
  ],
};
