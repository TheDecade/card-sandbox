# **iPad Card Game Sandbox — Development Specification**

## **1\. Project Overview**

I want to develop an **iPad application that acts as a digital sandbox for designing, editing, and playtesting card games**.

The application should allow me to:

1. Maintain a **main card list** containing all cards in the game.  
2. Edit and manage those cards.  
3. Configure the number of players.  
4. Start a playtest using the current card list.  
5. Interact with cards digitally as if playing a physical card game.  
6. Preserve the current playtest state until the user explicitly resets it.

The application is primarily intended as a **rapid prototyping and playtesting tool**, rather than as a finished game.

### **Development environment**

* Target platform: **iPad**  
* Development computer: **Windows 11 PC**  
* I also have access to a **MacBook Air**, which can be used when necessary for Apple-specific development, testing, signing, or deployment.  
* The application should preferably be developed using a technology stack that allows the majority of development to happen on Windows.

### **Distribution and platform decision**

* The application is for **personal use only**. It will **not** be published on the App Store or distributed to other users.  
* The application will be a **web application (PWA)**, built touch-first for iPad Safari.  
* It is installed on the iPad via Safari **Share → Add to Home Screen**, so it runs full-screen, offline-capable, and exempt from Safari's 7-day storage eviction.  
* The app code is served from free static HTTPS hosting (e.g. GitHub Pages, Netlify, Cloudflare Pages). HTTPS is required for the service worker / install. Only the code is hosted — **no user data is ever sent to a server**.  
* Development, testing, and deployment happen entirely on Windows. The MacBook Air is **not required** (optionally useful for Safari Web Inspector debugging of the iPad).  
* The same app also runs in desktop browsers (e.g. for comfortable card editing on the PC), but each browser/device keeps its own independent local data.  
* If a native app is ever needed later, the web code can be wrapped with Capacitor; this is out of scope for now.

The development plan should be based on this web/PWA approach and account for Safari/iPadOS-specific web limitations.

---

# **2\. Application Structure**

The application has three main areas:

1. **Playtest Mode**  
2. **Card Edit Mode**  
3. **Options**

The main menu should provide access to all three.

### **Main Menu**

The menu should contain:

* **Playtest Mode**  
* **Card Edit Mode**  
* **Options**

The menu should also provide an action to:

* **Reset Playtest**

Resetting the playtest must require explicit user interaction and should not happen automatically.

---

# **3\. Global Game Data**

The application maintains a persistent **Main Card List**.

The Main Card List contains every card available in the game.

Cards can be:

* created  
* edited  
* enabled/disabled  
* assigned an image  
* used in playtests

Only cards whose **Enabled** property is `true` should be included in newly created playtest decks.

Each card must have a unique, persistent **ID**.

### **Card Properties**

Every card has the following properties:

| Property | Editable | Visible in Playtest |
| ----- | ----- | ----- |
| ID | No | No |
| Image | Yes | Yes |
| Displayed Name | Yes | Yes |
| Cost | Yes | Yes |
| Description | Yes | Yes |
| Enabled | Yes | No |

The ID must be generated automatically when the card is created.

---

# **4\. Options**

The Options screen should currently contain:

### **Number of Players**

Allow the user to select the number of players participating in the playtest.

The architecture should allow the supported player count to be changed or expanded later.

Changing the number of players should be handled carefully if an existing playtest is already in progress. Define and implement appropriate behavior for this case.

---

# **5\. Playtest Mode**

## **5.1 General Concept**

Playtest Mode represents a digital tabletop for the currently selected player.

Each player has their own play area.

The play area consists of:

* a large empty canvas/tabletop  
* a deck  
* a graveyard  
* an exile zone  
* a hand  
* navigation controls for switching between players

Cards placed on the canvas can be freely dragged around.

---

# **6\. Player Area Layout**

Each player's play area should contain:

### **Deck**

A square/rectangular zone in the **top-left corner** representing the player's deck.

The deck contains one copy of every **enabled card** from the Main Card List.

When a new playtest starts:

* each player's deck is created from the current enabled Main Card List  
* each player's deck is independently shuffled

The decks should maintain their own independent state.

### **Graveyard**

A small rectangle positioned above the deck.

It should:

* be visually identifiable  
* contain a label such as `Graveyard`  
* not display individual cards directly

Tapping the Graveyard opens a **list dialog** showing the cards currently inside it.

### **Exile**

A small rectangle positioned above/near the deck, visually distinct from the Graveyard.

It should:

* contain a label such as `Exile`  
* not display individual cards directly

Tapping Exile opens a **list dialog** showing the cards currently exiled.

### **Hand**

A dedicated area along the **bottom of the screen** displaying the current player's hand.

Cards in the hand are face-up.

### **Player Navigation**

Provide:

* a **previous player** arrow in the bottom-left  
* a **next player** arrow in the bottom-right

The UI should clearly display which player is currently being viewed.

For example:

`Player 2`

Switching players should preserve the complete state of every player's play area.

---

# **7\. Card Interaction**

Cards can exist in several zones:

* Deck  
* Hand  
* Canvas  
* Graveyard  
* Exile

The application must maintain the correct location and state of every card.

## **7.1 Drawing a Card**

The user can drag a card from the deck.

When the user begins dragging from the deck:

* the top card of the deck is taken  
* the card becomes a draggable object  
* the card can be moved around the play area

When the user releases the touch:

* the card is placed at the location where it was released

The exact behavior should be defined for dropping a card into special zones such as the deck, hand, graveyard, or exile.

**7.2 Tap a Card**  
The user can double tap (touch input)  a card in the canvas to rotate it 90° clockwise “tapping” it (magic the gathering concept). The same action “untaps” tapped card, restoring its original rotation..

---

# **8\. Deck Interaction**

## **8.1 Tapping the Deck**

Tapping the deck opens a dialog containing:

* **Shuffle Deck**

Selecting `Shuffle Deck` randomly shuffles the remaining cards in the deck.

## **8.2 Dropping a Card Onto the Deck**

Dragging a card onto the deck opens a dialog with:

* **Place on Top**  
* **Place on Bottom**  
* **Cancel**

Cards placed onto the deck must always become **face-down**.

---

# **9\. Card Orientation**

Cards have two possible visual states:

### **Face-Up**

Cards are face-up when located:

* in the player's hand  
* on the canvas  
* inside the Graveyard/Exile list dialog

### **Face-Down**

Cards are face-down when located:

* inside the deck

The implementation should keep the card's actual identity separate from its visual representation so that hidden information can be enforced correctly.

---

# **10\. Graveyard and Exile**

The Graveyard and Exile are primarily containers rather than visual card piles.

They should appear as labeled rectangles.

### **Opening a Zone**

Tapping either zone opens a list dialog.

The list dialog displays all cards currently inside that zone.

Each entry should show enough information to identify the card, including its image and/or name.

---

# **11\. Magnified Card View**

When the user taps a card located:

* in the hand  
* on the canvas  
* inside the Graveyard list  
* inside the Exile list

the application should display an enlarged/magnified view of that card.

The magnified view should make the card easy to read.

The user can exit the magnified view by tapping anywhere outside the card / on the play area.

The exact presentation method should be chosen according to the UI framework and should work well with touch interaction on iPad.

---

# **12\. Card Counters**

A long press / touch-and-hold on a card opens a **Counter Management Dialog**.

The dialog must allow the user to add or remove colored counters.

It contains:

### **Counter Amount**

An integer spinner/stepper used to select the number of counters.

### **Counter Color**

A selectable list of available counter colors.

The architecture should make it easy to add additional colors later.

### **Actions**

* **Add Counters**  
* **Remove Counters**  
* **Cancel**

Counters belong to the individual card instance, not to the card definition in the Main Card List.

For example, if two copies of the same card exist in a playtest, each copy must be able to have a different number of counters.

The current counter state must persist while the playtest is active.

The visual representation of counters on cards should be clearly visible without obscuring important card information.

---

# **13\. Playtest Persistence**

The playtest state must persist until the user explicitly chooses **Reset Playtest**.

The application must preserve:

* each player's deck order  
* each player's hand  
* cards on the canvas  
* card positions  
* cards in the Graveyard  
* cards in Exile  
* card face-up/face-down state  
* counters  
* the currently selected player

Closing and reopening the application should preferably restore the previous playtest state.

If this is technically feasible, implement persistent local storage for the playtest state.

---

# **14\. Reset Playtest**

Selecting **Reset Playtest** should completely discard the current playtest state.

The application should ask for confirmation before resetting.

After confirmation:

1. Remove all existing player-specific card states.  
2. Rebuild each player's deck using the currently enabled cards from the Main Card List.  
3. Shuffle each player's deck independently.  
4. Clear all hands.  
5. Clear all canvases.  
6. Clear all Graveyards.  
7. Clear all Exile zones.  
8. Remove all counters.  
9. Reset the selected player to Player 1\.

The Main Card List itself must **not** be modified by resetting a playtest.

---

# **15\. Card Edit Mode**

Card Edit Mode displays the complete Main Card List.

The user should be able to:

* view all cards  
* create a new card  
* edit an existing card  
* enable/disable a card

## **15.1 Card List**

Display all cards in a scrollable list.

Each card entry should provide enough information to identify it, such as:

* image  
* name  
* cost  
* enabled status

The list should support a large number of cards efficiently.

---

# **16\. Creating a Card**

Provide an **Add New Card** button.

When creating a card:

1. Generate a unique ID automatically.  
2. Create the card with default/empty properties.  
3. Allow the user to edit its properties.  
4. Allow the user to save or discard the new card.

---

# **17\. Editing a Card**

Tapping a card opens an editor popup/dialog.

The editor should contain:

### **Card Preview**

A visual preview of the card.

### **Properties**

Display the following editable properties:

* Image  
* Displayed Name  
* Cost  
* Description

The ID should also be displayed, but must be read-only.

### **Enabled Toggle**

Provide an `Enabled` toggle.

If `Enabled` is false:

* the card remains in the Main Card List  
* the card can still be edited  
* the card is excluded from newly created/reset playtest decks

### **Actions**

Provide:

* **Save**  
* **Discard**

`Save` commits the changes to the Main Card List.

`Discard` cancels all changes made during the current editing session.

---

# **18\. Card Images**

The `Image` property should be selectable.

Tapping the Image property opens an image-selection interface containing the available card images.

The image system should be designed so that additional images can easily be added later.

The implementation should avoid unnecessarily duplicating image assets for every card.

### **Image storage and import**

* All images are stored **locally on the iPad**, inside the app's own browser storage (IndexedDB), in a shared image library.  
* Each image is stored once and has its own ID; card definitions reference images by ID.  
* The user adds images with an **Import Images** action that uses the standard file picker, allowing **multiple images** to be selected at once from **Photos** or the **Files app** (iCloud Drive, On My iPad, external drives, etc.).  
* The app does **not** read or watch a folder in the Files app directly (not possible for a web app); images always enter through the picker.  
* Imported images should be reasonably downscaled/compressed to keep storage usage and memory manageable.

---

# **19\. Important Architectural Requirements**

The application should clearly separate:

### **Card Definition**

Persistent information about a card:

* ID  
* image  
* name  
* cost  
* description  
* enabled

### **Card Instance**

A specific copy of a card inside a playtest.

A card instance should contain information such as:

* reference to the card definition  
* current zone  
* position on canvas  
* face-up/face-down state  
* counters  
* other future gameplay state

This distinction is important because multiple instances of the same card can exist simultaneously and each instance can have different state.

---

# **20\. Data Persistence**

Use local persistent storage.

At minimum, persist:

### **Card Database**

* Main Card List  
* card properties  
* enabled status  
* image references

### **Playtest State**

* number of players  
* player states  
* deck contents/order  
* hands  
* canvas cards and positions  
* Graveyards  
* Exile zones  
* counters  
* selected player

### **Local storage location**

All data (card database, image library, playtest state, options) is stored **locally on the iPad** in the app's browser storage (IndexedDB). Nothing is stored on a server.

The app should request persistent storage (`navigator.storage.persist()`) to reduce the risk of the browser evicting data.

### **Backup: Export / Import**

Because the data lives only in the app's local storage, provide:

* **Export** — packages the card database, image library (and optionally the playtest state) into a single backup file, saved via the iPad Share sheet / download to the Files app.  
* **Import** — restores from a backup file chosen via the file picker, with confirmation before overwriting existing data.

Export/Import is also the way to move data between devices/browsers (e.g. from the PC to the iPad). Automatic sync is out of scope.

The data model should be designed so that new card properties and gameplay mechanics can be added later without requiring a complete rewrite. Stored data should carry a schema version so that future changes can be migrated.

---

# **21\. UX Requirements**

The application is intended for **touch-first iPad interaction**.

Prioritize:

* large touch targets  
* clear visual feedback  
* drag-and-drop interactions  
* minimal unnecessary menus  
* readable cards  
* smooth animations  
* intuitive gestures  
* landscape-oriented tabletop interaction if appropriate

Avoid relying on mouse/keyboard-specific interactions.

Because the app runs in iPad Safari, it must suppress default browser behaviors that conflict with gameplay gestures:

* long-press callout menus and text selection (conflicts with the counter long-press)  
* double-tap zoom and pinch zoom of the page (conflicts with double-tap to tap a card)  
* page scrolling, rubber-band bounce, and pull-to-refresh while dragging cards

The UI should work well with both portrait and landscape orientation unless there is a strong technical reason to restrict orientation.

---

# **22\. Future Extensibility**

The application is a sandbox/prototyping tool, so the architecture should anticipate future functionality.

Potential future features include:

* custom card properties  
* card types  
* card abilities  
* tokens  
* additional counters  
* card rotation  
* card grouping  
* multiple decks  
* card search/filtering  
* undo/redo  
* merging/partial importing of card databases (basic full export/import is in scope, see section 20)  
* syncing data between devices  
* saving multiple games/playtests  
* multiplayer/networked play  
* scripting card behavior  
* customizable player areas  
* additional zones

Do not implement these features now unless necessary, but avoid architectural decisions that would make them unnecessarily difficult to add later.

---

# **23\. Development Planning Task**

Based on this specification, create a **complete development plan** for the application.

The plan should include:

1. Recommended web technology stack (the PWA approach is already decided — see section 1).  
2. Explanation of why that stack is appropriate for a touch-first iPad web app developed entirely on Windows.  
3. Project architecture.  
4. Recommended UI framework.  
5. Data model/schema.  
6. State-management architecture.  
7. Persistence strategy.  
8. Folder/project structure.  
9. Major application components.  
10. Implementation phases.  
11. Development milestones.  
12. Testing strategy.  
13. iPad / Safari-specific considerations (gestures, storage, PWA install, orientation).  
14. Hosting and deployment to the iPad (Home Screen install, updates), and whether the MacBook Air is useful at all (e.g. Safari Web Inspector).  
15. Recommended libraries/packages.  
16. Potential technical risks and how to mitigate them.  
17. Suggested MVP scope.  
18. Features that should be postponed until after the MVP.  
19. A recommended implementation order.  
20. Example data structures/classes/models where useful.

The goal is to produce a **practical, implementation-ready roadmap**, not merely a high-level description.

When making architectural decisions, prioritize:

1. Reliability  
2. Simplicity  
3. Fast iteration  
4. Good touch interaction  
5. Maintainability  
6. Future extensibility  
7. Ability to develop entirely on Windows  
8. Ease of deploying to and updating on the iPad

