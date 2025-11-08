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
}

module.exports = new Rooms();
