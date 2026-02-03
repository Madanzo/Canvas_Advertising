# Canvas Advertising

> 🖨️ Austin's Full-Service Print Shop | Signs, Wraps & More

A modern, full-stack web application for **Canvas Advertising LLC** — a commercial printing and signage company located in Austin, TX.

![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)
![Google Cloud](https://img.shields.io/badge/Google_Cloud-4285F4?style=flat&logo=google-cloud&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)

---

## 📋 Overview

This project is a comprehensive business solution combining a customer-facing website with a powerful custom internal CRM and automation engine.

### Customer-Facing Website
- **Services Showcase**: Detailed pages for Wraps, Signage, and Printing.
- **Lead Capture**: Dynamic quote requests and contact forms.
- **Project Gallery**: Real-time project portfolio fetched from the database.

### Internal Admin Dashboard
- **Lead Management**: Track leads from "New" to "Won".
- **Contact History**: Timeline view of all emails and SMS messages.
- **Workflow Automation**: Visual builder for automated email/SMS sequences.
- **Template Manager**: Edit HTML emails and SMS templates directly.
- **Direct Messaging**: Send quick emails or texts to clients from the dashboard.

---

## 🛠️ Tech Stack

### Frontend
- **HTML5 / CSS3**: Custom responsive design without heavy frameworks.
- **Vanilla JavaScript**: Lightweight interactions and dynamic DOM auditing.
- **Firebase SDK**: Client-side connection for Auth and Firestore.

### Backend (Serverless)
- **Firebase Hosting**: Fast, secure global CDN.
- **Cloud Functions for Firebase**: Node.js backend logic.
- **Firestore (NoSQL)**: Real-time database for leads, templates, and logs.
- **Authentication**: Google Sign-In for Admin access.

### Integrations
- **Resend**: Transactional email delivery.
- **Plivo**: SMS messaging logic.
- **Cal.com**: Booking system integration (webhooks).

---

## 📁 Project Structure

```
Canvas_Advertising/
├── admin.html          # Admin Dashboard entry point
├── index.html          # Main landing page
├── css/
│   ├── admin.css       # Dashboard specific styles
│   └── styles.css      # Main website styles
├── js/
│   ├── admin.js        # Dashboard logic (Auth, CRUD, UI)
│   ├── main.js         # Frontend website logic
│   └── firebase-config.js # Firebase initialization
├── functions/          # Backend Logic (Cloud Functions)
│   ├── index.js        # Main server entry point
│   └── templates/      # Base HTML templates
└── firestore.rules     # Database security rules
```

---

## 🚀 Getting Started

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Madanzo/Canvas_Advertising.git
   cd Canvas_Advertising
   ```

2. **Install Backend Dependencies**:
   ```bash
   cd functions
   npm install
   ```

3. **Set up Environment**:
   - Ensure you have the `firebase-tools` CLI installed.
   - Login: `firebase login`.
   - Select project: `firebase use default`.

4. **Run Local Emulators** (Optional but recommended for Function testing):
   ```bash
   firebase emulators:start
   ```

5. **Serve Frontend**:
   ```bash
   npx serve .
   ```

### Deployment

Deploy both the frontend (Hosting) and backend (Functions):

```bash
firebase deploy
```

---

## 📞 Contact Information

**Canvas Advertising LLC**

- 📍 **Address**: 8711 Burnet Rd, Suite F70, Austin, TX 78757
- 📱 **Phone**: (512) 945-9783
- 📧 **Email**: sales@canvas-advertising.com
- 🕐 **Hours**: Monday - Friday, 9:00 AM - 5:00 PM

---

## 📄 License

© 2026 Canvas Advertising LLC. All rights reserved.
