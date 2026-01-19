# CHECKPOINT_2026-01-19

## Project Overview
- **Name:** Canvas Advertising
- **Description:** A modern, responsive static website for a commercial printing and signage company in Austin, TX.
- **Deployment:** Firebase Hosting (`canvas-adnvertising`)

## Tech Stack
- **Framework:** None (Static HTML/CSS/JS)
- **Styling:** Vanilla CSS3 with custom properties (CSS Variables)
- **Scripting:** Vanilla JavaScript (ES6+)
- **Fonts:** Google Fonts (Bebas Neue, DM Sans)
- **Hosting:** Firebase Hosting

## Folder Structure
```
Canvas_Advertising/
├── css/
│   └── styles.css       # Main stylesheet
├── js/
│   ├── main.js          # UI interactivity (gallery, slider, nav)
│   └── firebase-config.js # Firebase App initialization
├── .firebase/           # Firebase cache (gitignored)
├── index.html           # Main English landing page
├── index-es.html        # Main Spanish landing page
├── thank-you.html       # English success page
├── thank-you-es.html    # Spanish success page
├── firebase.json        # Firebase hosting configuration
├── .firebaserc          # Firebase project alias
└── README.md            # Project documentation
```

## Key Files
- `index.html`: Primary entry point, contains SEO metadata, schema, and all landing page sections.
- `css/styles.css`: Contains 100% of the styling, including responsive media queries and animations.
- `js/main.js`: Handles navigation toggle, gallery filtering, and image sliders.

## Integrations
- **Firebase Hosting**: For serving the static site.
- **Firebase Storage**: Hosts images (logo, portfolio items).
- **Cal.com**: Embedded booking widget ("30min" event).
- **Schema.org**: JSON-LD `LocalBusiness` structured data.

## Recent Changes
- Updated all phone numbers to `(512) 945-9783`.
- Reverted Main and Nav CTAs to trigger phone calls (Nav) and Booking Modal (Hero/Footer).
- Updated Cal.com integration to use the `30min` event link.
- Fixed logo visibility issues via CSS.

## Known Issues / TODOs
- Social media links currently point to `#`.
- Form submission needs backend verification (currently client-side only?).
- `print-perfect-austin-ref` directory is empty/unused.

## Next Steps
- Verify form operational status.

## Cleanup Results
- **Files Deleted:** `REVIEW_REQUEST.md`
- **Directories Deleted:** `print-perfect-austin-ref/`
- **Date:** 2026-01-19
- **Status:** Cleanup Complete.
