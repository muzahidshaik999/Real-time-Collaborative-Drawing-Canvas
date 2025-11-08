// Simple drawing state manager: global operation history with redo stack.
class DrawingState {
  constructor() {
    this.ops = []; // list of operations (strokes)
    this.redoStack = [];
  }

  addOp(op) {
    this.ops.push(op);
    // new op invalidates redo history
    this.redoStack = [];
  }

  removeOpById(opId) {
    const idx = this.ops.findIndex(o => o.id === opId);
    if (idx === -1) return null;
    const [removed] = this.ops.splice(idx, 1);
    this.redoStack.push(removed);
    return removed;
  }

  popLastOp() {
    if (this.ops.length === 0) return null;
    const op = this.ops.pop();
    this.redoStack.push(op);
    return op;
  }

  redoLast() {
    if (this.redoStack.length === 0) return null;
    const op = this.redoStack.pop();
    this.ops.push(op);
    return op;
  }

  clear() {
    this.ops = [];
    this.redoStack = [];
  }

  getState() {
    return { ops: this.ops.slice(), redoStack: this.redoStack.slice() };
  }
}

module.exports = DrawingState;
