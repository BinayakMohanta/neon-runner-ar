# Neon Runner AR

A futuristic augmented reality game built with Three.js and WebXR. Navigate your neon car through obstacles, collect coins, and survive escalating challenges in both desktop and AR environments.

## Features

- **WebXR AR Support**: Play in augmented reality on compatible devices (Android with ARCore, iOS 16+)
- **Progressive Difficulty**: Game speeds up with each level
- **High Score Tracking**: Local storage of best scores
- **Neon Aesthetic**: Cyberpunk-inspired visuals with shader-based effects
- **Responsive Design**: Works on mobile and desktop browsers

## Technical Stack

- **Three.js**: 3D graphics and rendering
- **WebXR**: Augmented reality support
- **Vite**: Fast build tooling and development server
- **Vanilla JavaScript**: No framework dependencies

## Getting Started

### Development

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` (or the next available port).

### Build for Production

```bash
npm run build
```

Output is in the `dist/` folder, ready to deploy.

## How to Play

1. **Desktop/Mobile Browser**: Use arrow keys to steer left/right
2. **AR Mode**: Tap the "START AR" button on compatible devices
   - Position your device to view the game world
   - Tap to pause/resume (if implemented)
   - Steer with on-screen controls or device tilt

### Gameplay

- **Objective**: Avoid red obstacles, collect gold coins
- **Scoring**: +10 points per avoided obstacle, +100 for each coin
- **Levels**: Speed increases every 10 seconds
- **Game Over**: Collision with any obstacle

## AR Requirements

- **Android**: Chrome/Edge with WebXR support and ARCore
- **iOS**: Safari 16+ with WebXR support (limited)
- **HTTPS**: AR only works over secure connections

### Testing Locally with AR

For local HTTPS testing:

```bash
npm run dev -- --https
```

You'll need to accept the self-signed certificate on your device.

## Project Structure

```
/
├── index.html       # Entry point with HUD and menus
├── main.js          # Game logic, rendering loop, AR setup
├── package.json     # Dependencies and scripts
└── public/          # Static assets (currently minimal)
```

## Game Architecture

### Three.js Scene Hierarchy

- **Scene**: Main 3D world
- **Camera**: Follows player perspective
- **Renderer**: WebGL with XR support
- **Background**: Neon sun, starfield, grid
- **Player**: Cyan neon car with outline
- **Obstacles**: 3 procedural types with varied colors
- **Collectibles**: Gold rotating coins

### Game State Management

- `isGameRunning`: Current game status
- `score` / `bestScore`: Points tracking
- `gameLevel` / `timeMultiplier`: Difficulty scaling
- `currentLane`: Player position (3 lanes available)

### Collision Detection

Simple AABB (Axis-Aligned Bounding Box) checks on object positions. Obstacles trigger game over; coins add points and are removed.

## Customization

- **Colors**: Edit the hex color values in `main.js` (e.g., `0x66FCF1` for cyan)
- **Spawn Rates**: Adjust `setInterval()` calls for obstacle and coin frequency
- **Difficulty**: Modify `baseSpeed`, `levelDuration`, or `timeMultiplier`
- **Lane Count**: Change the `lanes` array to add more side-by-side paths

## Performance Notes

Three.js Three.js bundle is ~500KB minified. For production:
- Consider code splitting if adding more features
- Use `dist` build for deployment
- Test AR performance on target devices

## License

Open source. Feel free to modify and extend!
