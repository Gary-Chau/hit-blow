const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static('public'));

// 遊戲房間管理
const rooms = new Map();

// 生成隨機房間ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// 生成4位數字密碼
function generateSecretCode() {
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += Math.floor(Math.random() * 10);
    }
    return code;
}

io.on('connection', (socket) => {
    console.log('用戶連接:', socket.id);

    // 創建房間
    socket.on('createRoom', (playerName) => {
        const roomId = generateRoomId();
        const room = {
            id: roomId,
            players: [{
                id: socket.id,
                name: playerName,
                ready: false
            }],
            gameState: {
                started: false,
                currentPlayer: 0,
                secretCode: '',
                attempts: [],
                attemptsLeft: 10,
                timeLeft: 45,
                winner: null
            },
            settings: {
                turnTime: 45,
                maxPlayers: 4
            }
        };
        
        rooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, room });
    });

    // 加入房間
    socket.on('joinRoom', ({ roomId, playerName }) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('error', '房間不存在');
            return;
        }

        if (room.players.length >= room.settings.maxPlayers) {
            socket.emit('error', '房間已滿');
            return;
        }

        if (room.gameState.started) {
            socket.emit('error', '遊戲已經開始');
            return;
        }

        room.players.push({
            id: socket.id,
            name: playerName,
            ready: false
        });

        socket.join(roomId);
        io.to(roomId).emit('playerJoined', { room });
    });

    // 玩家準備
    socket.on('playerReady', (roomId) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.ready = true;
            
            // 檢查是否所有玩家都準備好了
            const allReady = room.players.every(p => p.ready);
            if (allReady && room.players.length >= 2) {
                room.gameState.started = true;
                room.gameState.secretCode = generateSecretCode();
                io.to(roomId).emit('gameStart', { room });
                startGameTimer(roomId);
            } else {
                io.to(roomId).emit('playerStatusUpdate', { room });
            }
        }
    });

    // 玩家猜測
    socket.on('makeGuess', ({ roomId, guess }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState.started) return;

        const currentPlayer = room.players[room.gameState.currentPlayer];
        if (currentPlayer.id !== socket.id) {
            socket.emit('error', '不是你的回合');
            return;
        }

        const result = checkGuess(guess, room.gameState.secretCode);
        room.gameState.attempts.push({
            playerId: socket.id,
            playerName: currentPlayer.name,
            guess,
            result
        });
        room.gameState.attemptsLeft--;

        if (result.hit === 4) {
            room.gameState.winner = currentPlayer;
            io.to(roomId).emit('gameOver', { 
                room,
                winner: currentPlayer,
                secretCode: room.gameState.secretCode
            });
        } else if (room.gameState.attemptsLeft === 0) {
            io.to(roomId).emit('gameOver', { 
                room,
                winner: null,
                secretCode: room.gameState.secretCode
            });
        } else {
            room.gameState.currentPlayer = (room.gameState.currentPlayer + 1) % room.players.length;
            io.to(roomId).emit('turnUpdate', { room });
            resetTurnTimer(roomId);
        }
    });

    // 離開房間
    socket.on('leaveRoom', (roomId) => {
        const room = rooms.get(roomId);
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                rooms.delete(roomId);
            } else {
                io.to(roomId).emit('playerLeft', { room });
            }
        }
        socket.leave(roomId);
    });

    // 斷開連接
    socket.on('disconnect', () => {
        rooms.forEach((room, roomId) => {
            if (room.players.some(p => p.id === socket.id)) {
                room.players = room.players.filter(p => p.id !== socket.id);
                if (room.players.length === 0) {
                    rooms.delete(roomId);
                } else {
                    io.to(roomId).emit('playerLeft', { room });
                }
            }
        });
    });
});

// 檢查猜測結果
function checkGuess(guess, secretCode) {
    let hit = 0;
    let blow = 0;
    const secretArray = secretCode.split('');
    const guessArray = guess.split('');
    const secretCount = {};
    const guessCount = {};

    for (let i = 0; i < 4; i++) {
        if (guessArray[i] === secretArray[i]) {
            hit++;
        } else {
            secretCount[secretArray[i]] = (secretCount[secretArray[i]] || 0) + 1;
            guessCount[guessArray[i]] = (guessCount[guessArray[i]] || 0) + 1;
        }
    }

    for (const num in guessCount) {
        if (secretCount[num]) {
            blow += Math.min(guessCount[num], secretCount[num]);
        }
    }

    return { hit, blow };
}

// 回合計時器
function startGameTimer(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.gameState.timeLeft = room.settings.turnTime;
    const timer = setInterval(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom || !currentRoom.gameState.started) {
            clearInterval(timer);
            return;
        }

        currentRoom.gameState.timeLeft--;
        io.to(roomId).emit('timeUpdate', { timeLeft: currentRoom.gameState.timeLeft });

        if (currentRoom.gameState.timeLeft <= 0) {
            handleTimeOut(roomId);
        }
    }, 1000);
}

// 重置回合計時器
function resetTurnTimer(roomId) {
    const room = rooms.get(roomId);
    if (room) {
        room.gameState.timeLeft = room.settings.turnTime;
        io.to(roomId).emit('timeUpdate', { timeLeft: room.gameState.timeLeft });
    }
}

// 處理超時
function handleTimeOut(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const currentPlayer = room.players[room.gameState.currentPlayer];
    room.gameState.attempts.push({
        playerId: currentPlayer.id,
        playerName: currentPlayer.name,
        guess: '超時',
        result: { hit: 0, blow: 0 }
    });

    room.gameState.currentPlayer = (room.gameState.currentPlayer + 1) % room.players.length;
    io.to(roomId).emit('turnUpdate', { room });
    resetTurnTimer(roomId);
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 