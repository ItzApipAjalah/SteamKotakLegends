# SteamKotakLegends

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Electron](https://img.shields.io/badge/electron-39.2.7-9feaf9.svg)

**Explore and discover Steam games easily**

</div>

---

## Features

- **Game Search** - Search and explore Steam games by App ID or name
- **Game Details** - View detailed game information including prices, release dates, and metadata
- **Multiplayer Detection** - Automatically detect multiplayer/co-op support
- **Library Management** - Add/remove games to your local library
- **Manifest Download** - Download game manifests from ManifestHub/Kernelos
- **Online Fix Integration** - Find and download online fixes for multiplayer games
- **Account Management** - View Steam account information

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- Windows OS (for full functionality)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ItzApipAjalah/SteamKotakLegends.git
cd SteamKotakLegends
```

2. Install dependencies:
```bash
npm install
```

3. Start the application:
```bash
npm start
```

## 🛠️ Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the development server |
| `npm run package` | Package the app for distribution |
| `npm run make` | Create distributables (installers) |
| `npm run build:installer` | Build Windows installer |
| `npm run lint` | Run ESLint for code quality |

### Project Structure

```
SteamKotakLegends/
├── src/
│   ├── controllers/      # IPC handlers and main process controllers
│   ├── models/           # TypeScript interfaces and data models
│   ├── services/         # Business logic and API services
│   ├── cookie/           # Authentication cookies (gitignored)
│   ├── main.ts           # Electron main process
│   ├── preload.ts        # Preload script for renderer
│   ├── renderer.ts       # Renderer process logic
│   └── index.css         # Application styles
├── index.html            # Main HTML file
└── package.json
```

### Tech Stack

- **Electron** - Cross-platform desktop framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool
- **Electron Forge** - Packaging and distribution

## 🔧 Configuration

### Cookies Setup

For Online Fix functionality, you need to set up authentication cookies:

1. Create `src/cookie/online-fix.me_cookies.json` with your session cookies
2. Create `src/cookie/up_cookies.json` for uploads subdomain cookies

> **Note**: Cookie files are gitignored for security

## Building

### Windows Installer

```bash
npm run build:installer
```

The installer will be created in the `out/` directory.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

## Author

**ItzApipAjalah**

---

<div align="center">

⭐ Star this repository if you find it useful!

</div>
