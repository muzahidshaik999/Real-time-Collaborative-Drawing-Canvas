// Minimal room manager for single-room demo. Can be extended for multiple rooms.
class Rooms {
  constructor() {
    this.rooms = new Map();
  }

  ensure(roomId) {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, { users: new Map() });
    return this.rooms.get(roomId);
  }

  addUser(roomId, socketId, meta) {
    const room = this.ensure(roomId);
    room.users.set(socketId, meta || {});
  }

  removeUser(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.users.delete(socketId);
  }

  listUsers(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.users.entries()).map(([id, meta]) => ({ id, ...meta }));
  }

  getUser(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const meta = room.users.get(socketId);
    if (!meta) return null;
    return { id: socketId, ...meta };
  }

  updateUser(roomId, socketId, fields) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const meta = room.users.get(socketId) || {};
    const updated = { ...meta, ...(fields || {}) };
    room.users.set(socketId, updated);
    return { id: socketId, ...updated };
  }
}

module.exports = new Rooms();
