import type { StoryArc } from "../../narrative/types";

/**
 * The two griddle carts.
 *
 * Bell works the Greywater walk and Onder works the Quays' strand, and
 * between them they are the reason those districts have somewhere to
 * eat at all. Each scene opens its cart's counter (see VENDOR_STOCK)
 * and closes again. The market's own hot bar is not here: it is a
 * fixture bolted to the boards under the cage lamps, and it belongs to
 * the market arc that owns everything else on those boards.
 *
 * Deliberately storyless, for the same reason the streets arc is: none
 * of these scenes sets a flag any act reads, gates on one, moves a
 * standing, or sends the player anywhere. What they are for is that
 * cheap food and the cheap end of the chemistry should be reachable
 * from the districts a player is actually standing in, rather than only
 * from the two counters that sell guns.
 *
 * Like the streets arc, both nodes are opened directly by the
 * interactable standing next to the cart, so both are declared as
 * entries and reachability validates against how the world really opens
 * them.
 */
export const countersArc: StoryArc = {
  id: "counters",
  title: "What The Carts Are Selling",
  entryNodeId: "ct-steps",
  entryNodeIds: ["ct-quays"],
  nodes: [
    {
      id: "ct-steps",
      speaker: "Bell",
      text:
        "The cart is a griddle on wheels under a strip of court awning, " +
        "parked where the walk widens and the light off the shrine " +
        "reaches. Bell has a ladle in one hand and an opinion in the " +
        "other, and she is halfway through the opinion when she sees you. " +
        "\"— which is why nobody's fixed it. You eating? You look like " +
        "somebody who has not eaten.\"",
      location: "greywater-steps:east-walk",
      choices: [
        {
          id: "steps-order",
          label: "Look at what's on the griddle.",
          target: "ct-steps",
          effects: [{ type: "open-vendor", vendorId: "steps-food-cart" }],
        },
        {
          id: "steps-sugar",
          label: "Ask about the bowl of sugar tablets by the till.",
          target: "ct-steps-wake",
        },
        {
          id: "steps-leave",
          label: "Not tonight.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "ct-steps-wake",
      speaker: "Bell",
      text:
        "\"Wake sugar.\" She does not stop turning what is on the plate. " +
        "\"They press them for the Undercroft wakes, one a mourner, with " +
        "the name on. Mould's worn off years back so now it is just " +
        "sugar with a shape.\" A shrug. \"Everybody down here keeps one. " +
        "The chromed ones swear it settles them — goes quiet for a " +
        "second, they say. I have no chrome and no opinion. Take one if " +
        "you want. Leave what you think it was worth.\"",
      location: "greywater-steps:east-walk",
      choices: [
        {
          id: "wake-back",
          label: "\"I'll take one. And whatever's hot.\"",
          target: "ct-steps",
        },
        {
          id: "wake-leave",
          label: "Leave the bowl where it is.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "ct-quays",
      speaker: "Onder",
      text:
        "A tarp guyed off the wharf rail, a hot plate under it, and a " +
        "kettle going hard enough to be heard over the rain. Onder works " +
        "the night shift up here with his hood down over his eyes and " +
        "his back to the basin, which on this water reads as either long " +
        "experience or none at all. \"Tea's black and it's salt,\" he " +
        "says. \"You've been in it or you're about to be. Either way.\"",
      location: "flooded-quays:wharf",
      choices: [
        {
          id: "quays-order",
          label: "Get under the tarp and see what he has.",
          target: "ct-quays",
          effects: [{ type: "open-vendor", vendorId: "quays-food-cart" }],
        },
        {
          id: "quays-ask",
          label: "\"Who's out here to sell to?\"",
          target: "ct-quays-who",
        },
        {
          id: "quays-leave",
          label: "Leave him to the kettle.",
          effects: [{ type: "end" }],
        },
      ],
    },
    {
      id: "ct-quays-who",
      speaker: "Onder",
      text:
        "\"Divers. Lock crews, when there were lock crews. People who " +
        "come down that stair to meet somebody and find out the somebody " +
        "is late.\" He tips the kettle without looking. \"Nobody eats " +
        "before they go in the basin and everybody eats after, and they " +
        "all come up past me to do it. I am not here for the trade. I am " +
        "here because at four in the morning there wants to be one warm " +
        "thing on this water.\"",
      location: "flooded-quays:wharf",
      choices: [
        {
          id: "quays-who-back",
          label: "\"Then I'll have one.\"",
          target: "ct-quays",
        },
        {
          id: "quays-who-leave",
          label: "Let him get back to it.",
          effects: [{ type: "end" }],
        },
      ],
    },
  ],
};
