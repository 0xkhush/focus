# Documentation

## How It Works

1. You click a YouTube video
2. Extension checks the channel cache first
3. If not cached, calls YouTube Data API to analyze
4. Blocks or allows based on category + keywords
5. Learns the channel for future (no repeat API calls)

## Allowed Categories
- Music (10)
- Education (27)
- News & Politics (25)
- Science & Technology (28)

## Blocked Categories
- Gaming (20)
- Entertainment (24)
- Comedy (23)
- People & Blogs (22)
- All YouTube Shorts

## Troubleshooting

**Extension not working?**
- Check it's enabled at `chrome://extensions/`
- Make sure toggle is ON in popup
- Refresh YouTube page

**API errors?**
- Get your own free key from [Google Cloud Console](https://console.cloud.google.com/)
- Enable YouTube Data API v3
- Enter key in extension setup page
