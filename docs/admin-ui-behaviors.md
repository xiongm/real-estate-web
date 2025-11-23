# Admin UI Interaction Cheatsheet (Investor & Signatures panels)

This documents the small interaction patterns we wired into the admin portal so they can be reused elsewhere.

## Investor cards
- **Click/Enter/Space toggles inline edit**: clicking a card enters edit mode; clicking again (or pressing Enter/Space while focused) cancels back to view. No dedicated “Edit” button.
- **No toggle in manage mode**: when bulk-manage is on (checkboxes visible), card clicks are ignored for editing.
- **Cancel/Save stop propagation**: action buttons don’t bubble up to the card click handler.
- **Address autocomplete**: mailing address fields query `/api/places/mapbox/autocomplete` after 3+ chars with caching and abort handling; suggestions close on selection, Enter, click-away, or when closing the form.
- **Error handling**: validation banner clears when switching tabs, resetting/canceling forms, or editing inputs; dismissible manually.

## Signature/Signed packet cards
- **Click/Enter/Space toggles signees**: the whole card is a toggle to show/hide signer details; the standalone “View signees” button was removed.
- **Progress inline**: signer progress text stays inline with badges; expansion is only for detail view.
- **Selectable when managing**: bulk manage checkboxes still work; clicks on checkboxes stop propagation so toggle state isn’t affected.

## Keyboard notes
- Cards in these sections have `role="button"` + `tabIndex=0` to ensure keyboard focus/activation with Enter/Space.
- Inside editable areas, stopPropagation on Cancel/Save prevents accidental toggle.

## Reuse tips
- Wrap card content in a toggle handler, but gate it behind any “manage” mode.
- If you need per-row actions (copy links, etc.), stop propagation on those buttons so they don’t toggle the card.
- Keep error banners dismissible and auto-clearing on relevant input changes to avoid sticky warnings.
