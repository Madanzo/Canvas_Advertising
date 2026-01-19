# Canvas Advertising Website — Review Request

> **Goal**: Get feedback on deficiencies, missing features, or areas for improvement before launch.

---

## 📋 Project Summary

**Business**: Canvas Advertising LLC — Austin's full-service commercial printing and signage company.

**Tech Stack**: Static HTML/CSS/JS website (no framework)  
**Status**: Development build, not yet deployed  
**Lines of Code**: ~831 HTML, ~1,874 CSS, ~382 JS

---

## ✅ What's Currently Built

### Website Sections (in order)
| Section | Description |
|---------|-------------|
| **Navigation** | Fixed header with logo, nav links, phone number, mobile hamburger menu |
| **Hero** | Split-screen layout with headline, badges (Bilingual, Free Design), CTAs, trust indicators, featured work image |
| **Trust Bar** | 4-column stats: 20+ Years, 150+ Projects, 100% In-House, FREE Design |
| **Services** | 6 service cards: Commercial Printing, Large-Format, Vehicle Wraps, Storefront Signage, Interior Branding, Merch & Promo |
| **Why Canvas** | 6 benefit tiles: Bilingual Team, In-House Production, Free Graphic Design, Expert Installation, Fast Turnaround, Long-Term Partnership |
| **Before/After Slider** | Interactive image comparison slider (pre/post vehicle wrap) |
| **Gallery** | Horizontally scrolling portfolio with filter buttons (All, Vehicle Wraps, Signage, Printing) — 7 project images |
| **Process** | 4-step process: Consultation → Design → Production → Delivery & Install |
| **Testimonials** | 3 customer testimonials with star ratings |
| **Contact/CTA** | Quote request form + contact info (phone, address, email, hours) |
| **Footer** | Brand info, contact, hours, social links (Facebook, Instagram, LinkedIn, TikTok) |
| **Mobile Phone Button** | Sticky call-to-action button on mobile |

### Technical Features Implemented
- ✅ Responsive design (mobile + desktop)
- ✅ Smooth scroll navigation
- ✅ Mobile hamburger menu toggle
- ✅ Scroll-triggered animations (fade-in elements)
- ✅ Gallery filtering by category
- ✅ Horizontal drag-to-scroll gallery
- ✅ Before/After image comparison slider
- ✅ Contact form with validation
- ✅ SEO meta tags & Open Graph
- ✅ JSON-LD structured data (LocalBusiness schema)
- ✅ Google Fonts (Bebas Neue, DM Sans)
- ✅ All images hosted on Firebase Storage

---

## 🔴 Known Issues / Missing Items

### Critical
| Issue | Details |
|-------|---------|
| **No form backend** | Quote form submits but doesn't actually send data anywhere (no email integration) |
| **No favicon** | Missing favicon.ico and apple-touch-icon |
| **No logo image** | Using text-based logo, no actual logo graphic |
| **Social links are placeholder** | All social media links point to `#` |
| **Schema image is empty** | JSON-LD `"image": ""` has no value |

### Functional Gaps
| Gap | Notes |
|-----|-------|
| **No pricing information** | No pricing page or estimates shown |
| **No individual service pages** | All services on one page, no deep-dive pages |
| **No FAQ section** | Common questions not addressed |
| **No Google Maps embed** | Only a text link to Google Maps |
| **No live chat widget** | Phone/email only |

### Content Gaps
| Gap | Notes |
|-----|-------|
| **Gallery needs more images** | Only 7 portfolio items currently |
| **Testimonials are brief** | Short quotes, could use more detailed reviews |
| **No case studies** | No detailed project breakdowns |
| **No team page / About Us** | No staff bios or company story |
| **No blog** | Missing content marketing opportunity |

### SEO / Performance
| Item | Status |
|------|--------|
| OG Image | ❌ Missing (`og:image` not set) |
| Canonical URL | ❌ Not set |
| Sitemap.xml | ❌ Not created |
| robots.txt | ❌ Not created |
| Image lazy loading | ⚠️ Not implemented |
| Image alt text | ✅ Present on all images |

### Accessibility
| Item | Status |
|------|--------|
| ARIA labels | ⚠️ Partial (some buttons have them) |
| Keyboard navigation | ⚠️ Not fully tested |
| Color contrast | ⚠️ Not audited |
| Skip-to-content link | ❌ Missing |

---

## 🟡 Questions for Reviewer

1. **Form submission**: How should quote requests be handled? (Email service? CRM? Google Sheets?)

2. **Pricing strategy**: Should pricing be shown on the site, or is it quote-only?

3. **Service pages**: Do you want individual pages for each service, or is the single-page design sufficient?

4. **Social media**: What are the actual social media URLs?

5. **Logo**: Is there a logo file to use, or should one be designed?

6. **Analytics**: What analytics should be added? (Google Analytics? Facebook Pixel? etc.)

7. **Domain/Hosting**: Where will this be deployed? (Vercel, Netlify, GoDaddy, etc.)

8. **Spanish version**: Should there be a full Spanish translation of the site?

---

## 📁 File Structure

```
Canvas_Advertising/
├── index.html          # Main page (831 lines)
├── css/
│   └── styles.css      # All styles (1,874 lines)
├── js/
│   └── main.js         # Interactivity (382 lines)
└── README.md           # Developer documentation
```

---

## 👀 How to Preview

```bash
cd Canvas_Advertising
npx serve .
```
Then open `http://localhost:3000` in browser.

---

*Document generated: January 5, 2026*
