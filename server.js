// backend/server.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const WebSocket = require('ws');
const { CoinbaseCommerceAPI } = require('./coinbaseAPI');
require('dotenv').config();

const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const userSchema = new mongoose.Schema({
    email: String,
    password: String,
    balance: Number,
    walletAddress: String,
});

const User = mongoose.model('User', userSchema);

// Registro de Usuario
app.post('/registro', async (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword, balance: 0 });
    await newUser.save();
    res.status(201).send("Usuario registrado correctamente");
});

// Login de Usuario
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).send('Usuario no encontrado');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).send('Contraseña incorrecta');
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ token });
});

function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Lógica de Minería
app.post('/minar', authenticateToken, async (req, res) => {
    const { cryptoType } = req.body;
    const minedAmount = Math.random() * 0.01;
    const userShare = minedAmount * 0.1;
    const ownerShare = minedAmount * 0.9;
    const user = await User.findById(req.user.id);
    user.balance += userShare;
    await user.save();
    res.json({ userShare, ownerShare });
});

// WebSocket para estadísticas en tiempo real
const wss = new WebSocket.Server({ port: 8080 });
wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ message: 'Conectado al servidor de estadísticas' }));
    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        const user = await User.findById(data.userId);
        if (user) {
            const stats = {
                mined: user.balance,
                userShare: user.balance * 0.1,
                ownerShare: user.balance * 0.9,
            };
            ws.send(JSON.stringify(stats));
        }
    });
});

// Pago y retiro de criptomonedas con Coinbase Commerce
app.post('/pago', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    const walletAddress = req.body.walletAddress;
    const transaction = await CoinbaseCommerceAPI.createTransaction({
        amount: user.balance,
        currency: 'BTC',
        wallet: walletAddress,
    });
    if (transaction.success) {
        user.balance = 0;
        await user.save();
        res.json({ message: 'Pago realizado con éxito' });
    } else {
        res.status(500).json({ message: 'Error en el pago' });
    }
});

app.listen(3000, () => console.log('Servidor iniciado en puerto 3000'));
