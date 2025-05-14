# Hit & Blow - Multiplayer Number Guessing Game

A multiplayer implementation of the classic Hit & Blow (Bulls and Cows) number guessing game. Players take turns trying to guess a 4-digit number, with feedback provided in the form of "Hits" (correct digit in correct position) and "Blows" (correct digit in wrong position).

## Features

- Multiplayer support (2-4 players)
- Timed turns (30-60 seconds per turn)
- Modern and responsive UI
- Animations and visual feedback
- Victory celebrations
- Mobile-friendly design

## Live Demo

[Play the game here](https://hit-and-blow.vercel.app)

## Getting Started

### Prerequisites

- Node.js (v12 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/hit-and-blow.git
cd hit-and-blow
```

2. Install dependencies
```bash
npm install
```

3. Start the development server
```bash
npm start
```

4. Open your browser and visit `http://localhost:8080`

## How to Play

1. Select the number of players (2-4)
2. Enter player names
3. Choose turn duration (30-60 seconds)
4. Each player takes turns guessing a 4-digit number
5. After each guess, the game shows:
   - Hits: Correct digit in correct position
   - Blows: Correct digit in wrong position
6. Game ends when:
   - A player correctly guesses the number
   - All 10 attempts are used
   - Players can start a new game at any time

## Technologies Used

- HTML5
- CSS3
- JavaScript
- Vue.js
- Animate.css

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 