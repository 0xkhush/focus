# YouTube Content Filter Extension

A Chrome extension that blocks non-constructive YouTube videos, allowing only educational, music, study material, news, and science & technology content.

## Features

- 🎓 **Automatic Content Filtering** - Uses YouTube Data API v3 to analyze video content
- 🚫 **Smart Blocking** - Blocks non-constructive videos with a clear overlay
- ✅ **Allowed Categories**:
  - Education & Tutorials
  - Music & Instrumental
  - Study Materials
  - News & Politics
  - Science & Technology
- 📊 **Statistics Tracking** - Keeps count of blocked and allowed videos
- 🎯 **Toggle On/Off** - Easy enable/disable from popup

## Installation

### Step 1: Download the Extension
Clone or download this repository to your local machine.

### Step 2: Load Extension in Chrome

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked**
5. Select the `YOUTUBE EXTENSION` folder
6. The extension icon should appear in your toolbar

### Step 3: Generate Icon Files (Optional)
The extension requires icon files. You can:

**Option A**: Convert the provided SVG to PNG:
- Use an online converter like [CloudConvert](https://cloudconvert.com/svg-to-png)
- Convert `icon.svg` to three sizes: 16x16, 48x48, and 128x128
- Name them: `icon16.png`, `icon48.png`, `icon128.png`

**Option B**: Use any 128x128 image:
- Create or download any icon image
- Resize to create the three required sizes
- Place them in the extension folder

## How It Works

1. **Content Analysis**: When you navigate to a YouTube video, the extension extracts the video ID
2. **API Check**: Sends the video ID to YouTube Data API v3 to retrieve video details (title, description, tags, category)
3. **Smart Detection**: Analyzes the content using:
   - YouTube category IDs (Education, Music, News, Science & Technology)
   - Keyword analysis for educational terms (tutorial, learn, study, etc.)
   - Detection of non-constructive keywords (vlog, prank, gaming, etc.)
4. **Action**: If the video is deemed non-constructive, it displays a blocking overlay and pauses the video

## Allowed Content Categories

The extension allows videos from these YouTube categories:
- **Category 10**: Music
- **Category 25**: News & Politics
- **Category 27**: Education
- **Category 28**: Science & Technology

Plus any videos with educational keywords like:
- tutorial, learn, study, course, lecture
- programming, coding, math, science
- documentary, explained, guide

## Blocked Content Examples

The extension blocks videos typically containing:
- Vlogs and entertainment content
- Gaming and gameplay videos
- Prank and challenge videos
- Reaction videos
- Drama and gossip content
- Memes and compilations

## Using the Extension

### Popup Interface
Click the extension icon to:
- View filter status
- Enable/disable the filter
- See statistics (blocked vs allowed videos)
- View allowed content types

### Behavior on YouTube
- When a non-constructive video is detected, a blocking overlay appears
- The overlay shows the reason for blocking
- The video is automatically paused
- You can navigate away to find constructive content

## API Configuration

The extension uses YouTube Data API v3 with the API key configured in `background.js`.

**Current API Key**: `AIzaSyARJx_NHCMpVXm0Z7iOE-w1MyrbD8BmzO4`

### To Use Your Own API Key:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **YouTube Data API v3**
4. Create credentials (API Key)
5. Open `background.js`
6. Replace the API_KEY value with your new key:
   ```javascript
   const API_KEY = 'YOUR_NEW_API_KEY_HERE';
   ```

## Files Structure

```
YOUTUBE EXTENSION/
├── manifest.json          # Extension configuration
├── background.js          # Service worker with API logic
├── content.js            # Content script that runs on YouTube
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── icon.svg              # Icon template (needs conversion)
├── icon16.png            # 16x16 icon (create from SVG)
├── icon48.png            # 48x48 icon (create from SVG)
├── icon128.png           # 128x128 icon (create from SVG)
└── README.md             # This file
```

## Troubleshooting

### Extension Not Working?
- Check if the extension is enabled in `chrome://extensions/`
- Make sure you're on a YouTube video page (not homepage)
- Check the console for errors (F12 > Console tab)

### Videos Not Being Blocked?
- The API key might have reached its quota limit
- Check if the filter is enabled in the popup
- Some videos might pass the constructive filter legitimately

### API Quota Exceeded?
YouTube Data API has daily quota limits:
- Default: 10,000 units per day
- Each video check uses ~1-3 units
- Consider getting your own API key for unlimited personal use

### Icons Not Showing?
- Make sure you've created the PNG icon files
- Check that they're named correctly: `icon16.png`, `icon48.png`, `icon128.png`
- Reload the extension after adding icons

## Privacy & Permissions

The extension requires:
- **Storage**: To save user preferences and statistics
- **Tabs**: To detect YouTube navigation
- **Host Permissions**: 
  - `youtube.com` - To run content script
  - `googleapis.com` - To check videos via API

**No data is collected or sent anywhere except to YouTube's official API.**

## Customization

### Adjust Filtering Strictness
Edit `background.js` to modify:
- `allowedCategories` array - Add/remove category IDs
- `constructiveKeywords` array - Add keywords to whitelist
- `nonConstructiveKeywords` array - Add keywords to blacklist

### Change Overlay Design
Edit `content.js` in the `blockVideo()` function to customize:
- Colors and styling
- Messages and text
- Icon and layout

## Known Limitations

- Single Page Application: YouTube uses dynamic loading, so the extension monitors URL changes
- API Dependency: Requires active YouTube API key
- Keyword-based: Some edge cases might be incorrectly classified
- Category Overlap: Some entertainment content might be in allowed categories

## Future Improvements

- [ ] Machine learning-based content classification
- [ ] User whitelist/blacklist for specific channels
- [ ] Time-based rules (e.g., block before 6 PM on weekdays)
- [ ] Custom category selection
- [ ] Export/import settings

## License

Free to use and modify for personal purposes.

## Support

If you encounter issues:
1. Check this README for troubleshooting steps
2. Verify your API key is valid and has quota remaining
3. Check browser console for error messages
4. Try disabling and re-enabling the extension

---

**Built to help you stay focused on constructive content! 🎯**