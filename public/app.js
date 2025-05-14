const socket = io();

new Vue({
    el: '#app',
    data: {
        screen: 'login',
        playerName: '',
        roomId: '',
        maxPlayers: 4,
        turnTime: 45,
        currentRoom: null,
        guess: '',
        errorMessage: '',
        invalidInput: false,
        winner: null,
        secretCode: '',
        isReady: false
    },
    computed: {
        isCurrentPlayer() {
            if (!this.currentRoom || !this.currentRoom.gameState.started) return false;
            const currentPlayer = this.currentRoom.players[this.currentRoom.gameState.currentPlayer];
            return currentPlayer && currentPlayer.id === socket.id;
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
        
        createRoom() {
            socket.emit('createRoom', this.playerName);
        },
        
        joinRoom() {
            if (!this.roomId.trim()) {
                this.showError('請輸入房間代碼');
                return;
            }
            socket.emit('joinRoom', {
                roomId: this.roomId.trim().toUpperCase(),
                playerName: this.playerName
            });
        },
        
        playerReady() {
            socket.emit('playerReady', this.currentRoom.id);
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
                guess: guess
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
            this.playerReady();
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
            this.winner = null;
            this.secretCode = '';
            this.isReady = false;
        }
    },
    mounted() {
        // Socket.IO 事件監聽
        socket.on('roomCreated', ({ roomId, room }) => {
            this.currentRoom = room;
            this.screen = 'lobby';
        });
        
        socket.on('playerJoined', ({ room }) => {
            this.currentRoom = room;
            this.screen = 'lobby';
        });
        
        socket.on('playerStatusUpdate', ({ room }) => {
            this.currentRoom = room;
        });
        
        socket.on('gameStart', ({ room }) => {
            this.currentRoom = room;
            this.screen = 'game';
        });
        
        socket.on('turnUpdate', ({ room }) => {
            this.currentRoom = room;
        });
        
        socket.on('timeUpdate', ({ timeLeft }) => {
            if (this.currentRoom) {
                this.currentRoom.gameState.timeLeft = timeLeft;
            }
        });
        
        socket.on('gameOver', ({ room, winner, secretCode }) => {
            this.currentRoom = room;
            this.winner = winner;
            this.secretCode = secretCode;
            this.screen = 'gameOver';
        });
        
        socket.on('playerLeft', ({ room }) => {
            this.currentRoom = room;
        });
        
        socket.on('error', (message) => {
            this.showError(message);
        });
    }
}); 