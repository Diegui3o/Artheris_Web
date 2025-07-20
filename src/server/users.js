const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());

const USERS_FILE = path.join(__dirname, 'users.json');

// Users to read and write users
function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Create new user
app.post('/api/users', (req, res) => {
  const { id, nombre, email } = req.body;
  if (!id || !nombre) return res.status(400).json({ error: 'Fields are missing' });
  const users = readUsers();
  if (users.find(u => u.id === id)) return res.status(409).json({ error: 'It already exists' });
  const nuevo = { id, nombre, email, drones: [] };
  users.push(nuevo);
  writeUsers(users);
  res.json(nuevo);
});

// Add or update custom drone to a user
app.put('/api/users/:userId/drones/:droneId', (req, res) => {
  const { userId, droneId } = req.params;
  const droneData = req.body;
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  let drone = user.drones.find(d => d.id === droneId);
  if (drone) {
    Object.assign(drone, droneData);
  } else {
    user.drones.push({ id: droneId, ...droneData });
  }
  writeUsers(users);
  res.json({ ok: true, drone: user.drones.find(d => d.id === droneId) });
});

// Get user and their drones
app.get('/api/users/:userId', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Inicia el servidor (puerto 3002)
app.listen(3002, () => {
  console.log('User and drones server in http://localhost:3002');
});
