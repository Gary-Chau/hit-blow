const socket = io();

new Vue({
    el: '#app',
    data: {
        screen: 'login',
        playerName: '',
        roomId: '',
        roomName: '',
        isPublic: true,
        maxPlayers: 4,
        turnTime: 45,
        currentRoom: null,
        publicRooms: [],
        guess: '',
        errorMessage: '',
        invalidInput: false,
        winners: [],
        isReady: false,
        secretCode: '',
        targetPlayerId: ''
    },
    computed: {
        isCurrentPlayer() {
            if (!this.currentRoom || !this.currentRoom.gameState.started) return false;
            const currentPlayer = this.currentRoom.players[this.currentRoom.gameState.currentPlayer];
            return currentPlayer && currentPlayer.id === socket.id;
        },
        myPlayer() {
            if (!this.currentRoom) return null;
            return this.currentRoom.players.find(p => p.id === socket.id);
        },
        otherPlayers() {
            if (!this.currentRoom) return [];
            return this.currentRoom.players.filter(p => p.id !== socket.id);
        },
        amIWinner() {
            if (!this.currentRoom || !this.myPlayer) return false;
            return this.currentRoom.gameState.winners.includes(this.myPlayer.id);
        },
        // 我需要猜測誰的密碼
        myTarget() {
            if (!this.currentRoom || !this.myPlayer || !this.myPlayer.targetPlayerId) return null;
            return this.currentRoom.players.find(p => p.id === this.myPlayer.targetPlayerId);
        }
    },
    methods: {
        showCreateRoom() {
            if (!this.playerName.trim()) {
                this.showError('請輸入玩家名稱');
                return;
            }
            this.screen = 'createRoom';
        },
        
        showJoinRoom() {
            if (!this.playerName.trim()) {
                this.showError('請輸入玩家名稱');
                return;
            }
            this.screen = 'joinRoom';
        },

        showLobby() {
            if (!this.playerName.trim()) {
                this.showError('請輸入玩家名稱');
                return;
            }
            socket.emit('getRoomList');
            this.screen = 'lobby';
        },
        
        createRoom() {
            if (!this.roomName.trim()) {
                this.roomName = `${this.playerName}的房間`;
            }
            
            socket.emit('createRoom', {
                playerName: this.playerName,
                roomName: this.roomName,
                isPublic: this.isPublic,
                maxPlayers: this.maxPlayers,
                turnTime: this.turnTime
            });
        },
        
        joinRoom(id) {
            const roomIdToJoin = id || this.roomId.trim().toUpperCase();
            
            if (!roomIdToJoin) {
                this.showError('請輸入房間代碼');
                return;
            }
            
            socket.emit('joinRoom', {
                roomId: roomIdToJoin,
                playerName: this.playerName
            });
        },
        
        refreshRoomList() {
            socket.emit('getRoomList');
        },
        
        playerReady() {
            // 驗證密碼
            if (!/^\d{4}$/.test(this.secretCode)) {
                this.invalidInput = true;
                this.showError('請設置4位數字密碼');
                setTimeout(() => {
                    this.invalidInput = false;
                }, 1000);
                return;
            }
            
            // 驗證目標玩家
            if (!this.targetPlayerId) {
                this.showError('請選擇一位玩家作為你的猜測目標');
                return;
            }
            
            socket.emit('playerReady', {
                roomId: this.currentRoom.id,
                secretCode: this.secretCode,
                targetPlayerId: this.targetPlayerId
            });
            
            this.isReady = true;
        },
        
        makeGuess() {
            if (!this.isCurrentPlayer) return;
            
            const guess = this.guess.trim();
            if (!/^\d{4}$/.test(guess)) {
                this.invalidInput = true;
                this.showError('請輸入4位數字');
                setTimeout(() => {
                    this.invalidInput = false;
                }, 1000);
                return;
            }
            
            socket.emit('makeGuess', {
                roomId: this.currentRoom.id,
                guess: guess,
                targetPlayerId: this.myPlayer.targetPlayerId
            });
            
            this.guess = '';
        },
        
        leaveRoom() {
            if (this.currentRoom) {
                socket.emit('leaveRoom', this.currentRoom.id);
            }
            this.resetState();
            this.screen = 'login';
        },
        
        restartGame() {
            socket.emit('restartGame', this.currentRoom.id);
            this.isReady = false;
            this.secretCode = '';
            this.targetPlayerId = '';
        },
        
        showError(message) {
            this.errorMessage = message;
            setTimeout(() => {
                this.errorMessage = '';
            }, 3000);
        },
        
        resetState() {
            this.currentRoom = null;
            this.guess = '';
            this.winners = [];
            this.isReady = false;
            this.secretCode = '';
            this.targetPlayerId = '';
        },
        
        getPlayerStatusClass(playerId) {
            if (!this.currentRoom || !this.currentRoom.gameState.started) return '';
            
            if (this.currentRoom.gameState.winners.includes(playerId)) {
                return 'winner';
            }
            
            if (this.currentRoom.gameState.currentPlayer >= 0 && 
                this.currentRoom.players[this.currentRoom.gameState.currentPlayer].id === playerId) {
                return 'current-player';
            }
            
            return '';
        },
        
        getMyTargetName() {
            if (!this.myTarget) return '未選擇';
            return this.myTarget.name;
        },
        
        formatAttempt(attempt) {
            return `${attempt.playerName} 猜 ${attempt.targetPlayerName} 的密碼: ${attempt.guess} - ${attempt.result.hit} Hit, ${attempt.result.blow} Blow`;
        },
        
        showVictoryAnimation() {
            // 創建勝利動畫效果
            for (let i = 0; i < 50; i++) {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                confetti.style.left = Math.random() * window.innerWidth + 'px';
                confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
                confetti.style.animationDelay = Math.random() * 3 + 's';
                document.body.appendChild(confetti);
                
                setTimeout(() => {
                    confetti.remove();
                }, 5000);
            }
        }
    },
    mounted() {
        // Socket.IO 事件監聽
        socket.on('roomList', (rooms) => {
            this.publicRooms = rooms;
        });
        
        socket.on('roomListUpdated', () => {
            socket.emit('getRoomList');
        });
        
        socket.on('roomCreated', ({ roomId, room }) => {
            this.currentRoom = room;
            this.screen = 'waitingRoom';
        });
        
        socket.on('playerJoined', ({ room }) => {
            this.currentRoom = room;
            this.screen = 'waitingRoom';
        });
        
        socket.on('playerStatusUpdate', ({ room }) => {
            this.currentRoom = room;
        });
        
        socket.on('gameStart', ({ room }) => {
            this.currentRoom = room;
            this.screen = 'game';
        });
        
        socket.on('turnUpdate', ({ room, attempt }) => {
            this.currentRoom = room;
            
            // 如果是自己猜對了，播放勝利動畫
            if (attempt && attempt.playerId === socket.id && attempt.result.hit === 4) {
                this.showVictoryAnimation();
            }
        });
        
        socket.on('timeUpdate', ({ timeLeft }) => {
            if (this.currentRoom) {
                this.currentRoom.gameState.timeLeft = timeLeft;
            }
        });
        
        socket.on('gameOver', ({ room, winners }) => {
            this.currentRoom = room;
            this.winners = winners;
            this.screen = 'gameOver';
        });
        
        socket.on('gameRestarted', ({ room }) => {
            this.currentRoom = room;
            this.screen = 'waitingRoom';
        });
        
        socket.on('playerLeft', ({ room }) => {
            this.currentRoom = room;
        });
        
        socket.on('error', (message) => {
            this.showError(message);
        });
    }
}); 