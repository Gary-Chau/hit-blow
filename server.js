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

// 生成4位數字密碼（用於單人模式）
function generateSecretCode() {
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += Math.floor(Math.random() * 10);
    }
    return code;
}

// 獲取公開房間列表
function getPublicRooms() {
    const publicRooms = [];
    rooms.forEach((room) => {
        if (room.isPublic && !room.gameState.started) {
            publicRooms.push({
                id: room.id,
                name: room.name,
                players: room.players.length,
                maxPlayers: room.settings.maxPlayers,
                host: room.players[0]?.name || '未知'
            });
        }
    });
    return publicRooms;
}

io.on('connection', (socket) => {
    console.log('用戶連接:', socket.id);

    // 發送房間列表
    socket.emit('roomList', getPublicRooms());

    // 請求房間列表更新
    socket.on('getRoomList', () => {
        socket.emit('roomList', getPublicRooms());
    });

    // 創建房間
    socket.on('createRoom', ({ playerName, roomName, isPublic, maxPlayers, turnTime }) => {
        const roomId = generateRoomId();
        const room = {
            id: roomId,
            name: roomName || `${playerName}的房間`,
            isPublic: isPublic,
            players: [{
                id: socket.id,
                name: playerName,
                ready: false,
                secretCode: '',
                targetPlayerId: '',
                startTime: 0,
                endTime: 0,
                rounds: 0
            }],
            gameState: {
                started: false,
                currentPlayer: 0,
                attempts: [],
                timeLeft: turnTime,
                winners: [],
                isSinglePlayer: false
            },
            settings: {
                turnTime: turnTime || 45,
                maxPlayers: maxPlayers || 4
            }
        };
        
        rooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, room });
        
        // 如果是公開房間，通知所有用戶更新房間列表
        if (isPublic) {
            io.emit('roomListUpdated');
        }
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
            ready: false,
            secretCode: '',
            targetPlayerId: '',
            startTime: 0,
            endTime: 0,
            rounds: 0
        });

        socket.join(roomId);
        io.to(roomId).emit('playerJoined', { room });
        
        // 如果是公開房間，通知所有用戶更新房間列表
        if (room.isPublic) {
            io.emit('roomListUpdated');
        }
    });

    // 玩家準備
    socket.on('playerReady', ({ roomId, secretCode, targetPlayerId }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        player.ready = true;
        player.secretCode = secretCode;
        
        // 單人模式檢測
        if (room.players.length === 1) {
            room.gameState.isSinglePlayer = true;
            // 在單人模式中，目標ID是"computer"
            player.targetPlayerId = "computer";
            // 生成一個隨機密碼給玩家猜
            room.computerCode = generateSecretCode();
            console.log(`單人模式啟動，計算機密碼: ${room.computerCode}`);
        } else {
            player.targetPlayerId = targetPlayerId;
        }
        
        // 檢查是否所有玩家都準備好了
        const allReady = room.players.every(p => p.ready);
        
        if (allReady && (room.players.length >= 2 || room.gameState.isSinglePlayer)) {
            room.gameState.started = true;
            
            // 記錄每個玩家的開始時間
            room.players.forEach(p => {
                p.startTime = Date.now();
            });
            
            // 分配每個玩家的目標（被猜測者）
            if (!room.gameState.isSinglePlayer) {
                room.players.forEach((player) => {
                    const targetPlayer = room.players.find(p => p.id === player.targetPlayerId);
                    if (targetPlayer) {
                        console.log(`${player.name} 將猜測 ${targetPlayer.name} 設置的密碼`);
                    }
                });
            }
            
            io.to(roomId).emit('gameStart', { room });
            startGameTimer(roomId);
        } else {
            io.to(roomId).emit('playerStatusUpdate', { room });
        }
    });

    // 玩家猜測
    socket.on('makeGuess', ({ roomId, guess, targetPlayerId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState.started) return;

        const currentPlayer = room.players[room.gameState.currentPlayer];
        if (currentPlayer.id !== socket.id) {
            socket.emit('error', '不是你的回合');
            return;
        }

        // 增加玩家猜測回合數
        currentPlayer.rounds++;
        
        let result;
        let targetPlayerName;
        
        // 單人模式下的猜測處理
        if (room.gameState.isSinglePlayer) {
            result = checkGuess(guess, room.computerCode);
            targetPlayerName = "電腦";
            targetPlayerId = "computer";
        } else {
            // 多人模式猜測處理
            const targetPlayer = room.players.find(p => p.id === targetPlayerId);
            if (!targetPlayer) {
                socket.emit('error', '目標玩家不存在');
                return;
            }
            result = checkGuess(guess, targetPlayer.secretCode);
            targetPlayerName = targetPlayer.name;
        }
        
        const attempt = {
            playerId: socket.id,
            playerName: currentPlayer.name,
            targetPlayerId: targetPlayerId,
            targetPlayerName: targetPlayerName,
            guess,
            result,
            round: currentPlayer.rounds
        };
        
        room.gameState.attempts.push(attempt);

        if (result.hit === 4) {
            // 猜對了，標記為勝利者並記錄完成時間
            if (!room.gameState.winners.includes(currentPlayer.id)) {
                room.gameState.winners.push(currentPlayer.id);
                currentPlayer.endTime = Date.now();
                
                // 計算總耗時（毫秒）
                currentPlayer.totalTime = currentPlayer.endTime - currentPlayer.startTime;
            }
            
            // 單人模式時直接結束遊戲
            if (room.gameState.isSinglePlayer) {
                io.to(roomId).emit('gameOver', { 
                    room,
                    winners: [currentPlayer],
                    isSinglePlayer: true
                });
                return;
            }
            
            // 多人模式檢查是否所有玩家都猜出了密碼
            const remainingPlayers = room.players.filter(p => 
                !room.gameState.winners.includes(p.id) && 
                room.players.some(target => target.targetPlayerId === p.id)
            );
            
            if (remainingPlayers.length === 0) {
                // 排序獲勝者（按回合數和用時）
                const sortedWinners = room.gameState.winners
                    .map(id => room.players.find(p => p.id === id))
                    .sort((a, b) => {
                        // 首先按回合數排序
                        if (a.rounds !== b.rounds) {
                            return a.rounds - b.rounds;
                        }
                        // 回合數相同則按用時排序
                        return a.totalTime - b.totalTime;
                    });
                
                // 遊戲結束
                io.to(roomId).emit('gameOver', { 
                    room,
                    winners: sortedWinners,
                    isSinglePlayer: room.gameState.isSinglePlayer
                });
                return;
            }
        }

        // 繼續遊戲，輪到下一位玩家
        if (!room.gameState.isSinglePlayer) { // 多人模式才需要切換玩家
            do {
                room.gameState.currentPlayer = (room.gameState.currentPlayer + 1) % room.players.length;
                currentPlayer = room.players[room.gameState.currentPlayer];
                // 跳過已經猜對的玩家
            } while (room.gameState.winners.includes(currentPlayer.id) && 
                    room.gameState.winners.length < room.players.length);
        }

        io.to(roomId).emit('turnUpdate', { room, attempt });
        resetTurnTimer(roomId);
    });

    // 重新開始遊戲
    socket.on('restartGame', (roomId) => {
        const room = rooms.get(roomId);
        if (!room) return;
        
        // 重置房間狀態
        room.players.forEach(player => {
            player.ready = false;
            player.secretCode = '';
            player.targetPlayerId = '';
            player.startTime = 0;
            player.endTime = 0;
            player.rounds = 0;
        });
        
        room.gameState = {
            started: false,
            currentPlayer: 0,
            attempts: [],
            timeLeft: room.settings.turnTime,
            winners: [],
            isSinglePlayer: false
        };
        
        // 單人模式下重置電腦密碼
        if (room.computerCode) {
            delete room.computerCode;
        }
        
        io.to(roomId).emit('gameRestarted', { room });
    });

    // 離開房間
    socket.on('leaveRoom', (roomId) => {
        const room = rooms.get(roomId);
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                rooms.delete(roomId);
                
                // 如果是公開房間，通知所有用戶更新房間列表
                if (room.isPublic) {
                    io.emit('roomListUpdated');
                }
            } else {
                io.to(roomId).emit('playerLeft', { room });
                
                // 如果是公開房間，通知所有用戶更新房間列表
                if (room.isPublic) {
                    io.emit('roomListUpdated');
                }
            }
        }
        socket.leave(roomId);
    });

    // 斷開連接
    socket.on('disconnect', () => {
        let roomUpdated = false;
        
        rooms.forEach((room, roomId) => {
            if (room.players.some(p => p.id === socket.id)) {
                room.players = room.players.filter(p => p.id !== socket.id);
                if (room.players.length === 0) {
                    rooms.delete(roomId);
                    roomUpdated = room.isPublic;
                } else {
                    io.to(roomId).emit('playerLeft', { room });
                    roomUpdated = room.isPublic;
                }
            }
        });
        
        // 如果有公開房間變更，通知更新房間列表
        if (roomUpdated) {
            io.emit('roomListUpdated');
        }
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
    
    // 增加回合數
    currentPlayer.rounds++;
    
    let targetPlayerName = "未知";
    if (room.gameState.isSinglePlayer) {
        targetPlayerName = "電腦";
    } else {
        const targetPlayer = room.players.find(p => p.id === currentPlayer.targetPlayerId);
        if (targetPlayer) {
            targetPlayerName = targetPlayer.name;
        }
    }
    
    room.gameState.attempts.push({
        playerId: currentPlayer.id,
        playerName: currentPlayer.name,
        targetPlayerId: currentPlayer.targetPlayerId,
        targetPlayerName: targetPlayerName,
        guess: '超時',
        result: { hit: 0, blow: 0 },
        round: currentPlayer.rounds
    });

    // 單人模式不需要切換玩家
    if (!room.gameState.isSinglePlayer) {
        // 輪到下一位玩家
        do {
            room.gameState.currentPlayer = (room.gameState.currentPlayer + 1) % room.players.length;
            currentPlayer = room.players[room.gameState.currentPlayer];
            // 跳過已經猜對的玩家
        } while (room.gameState.winners.includes(currentPlayer.id) && 
                room.gameState.winners.length < room.players.length);
    }

    io.to(roomId).emit('turnUpdate', { room });
    resetTurnTimer(roomId);
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 