# Project Seeding Documentation

## Overview
This script seeds the Firestore database with all Canvas Advertising portfolio projects.

## Projects Included (11 total)

### Vehicle Wraps (6 projects)
1. **Waterloo Fleet Wrap** - Waterloo Sparkling Water fleet branding
2. **Mobile Billboard** - Fleet branding with mobile advertising graphics
3. **Commercial Van Wrap** - Complete van transformation for local business
4. **Construction Fleet Wrap** - Professional construction company vehicle wrap
5. **Posey Car Vinyl** - Custom car sign vinyl graphics
6. **Lightnin Dent Truck** - Service vehicle truck vinyl wrap

### Signage (4 projects)
7. **Monument Sign Refacing** - Commercial property monument sign and directory
8. **MTZ Banner Sign** - Large format banner signage
9. **Wild Heart Storefront** - Retail storefront vinyl graphics
10. **Tech Center Signage** - Monument sign vinyl refacing

### Interior/Printing (1 project)
11. **Store Fixture Wrap** - Retail store fixture and merchandising wraps
12. **Custom T-Shirts** - Construction company printed uniforms

## Setup Instructions

### 1. Get Service Account Key
1. Go to Firebase Console > Project Settings > Service Accounts
2. Click "Generate new private key"
3. Save the JSON file as `serviceAccountKey.json` in the project root
4. **IMPORTANT**: Add to `.gitignore` (already done)

### 2. Install Dependencies
```bash
npm install firebase-admin
```

### 3. Run the Seed Script
```bash
node seed-projects.js
```

## Data Structure

Each project includes:
- `id` - Unique project identifier (used for URLs)
- `slug` - URL-friendly slug
- `title` - Project title
- `client` - Client name
- `category` - Main category (Vehicle Wraps, Signage, Interior, Printing)
- `location` - Project location
- `description` - Detailed project description
- `featuredImage` - Main project image URL
- `images` - Array of all project images
- `services` - Array of services provided
- `featured` - Boolean for featured projects
- `createdAt` - Timestamp
- `updatedAt` - Timestamp

## Security Notes

⚠️ **NEVER commit `serviceAccountKey.json` to version control**
- This file contains sensitive credentials
- It's already in `.gitignore`
- Keep it secure and local only

## Usage After Seeding

Once seeded, projects can be:
- Queried from Firestore in Cloud Functions
- Displayed on dynamic project detail pages
- Filtered by category
- Sorted by featured status or creation date

## Re-running the Script

The script uses `batch.set()` which will overwrite existing projects with the same ID. To add new projects without affecting existing ones, modify the script to use `batch.update()` or check for existence first.
