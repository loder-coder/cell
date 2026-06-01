(() => {
class SpatialHash {
  constructor(cellSize = 220) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.queryStamp = 1;
  }

  clear() {
    this.cells.clear();
  }

  rebuild(items) {
    this.clear();
    for (let i = 0; i < items.length; i++) this.insert(items[i]);
  }

  insert(item) {
    const radius = item.radius || 0;
    const minX = Math.floor((item.x - radius) / this.cellSize);
    const maxX = Math.floor((item.x + radius) / this.cellSize);
    const minY = Math.floor((item.y - radius) / this.cellSize);
    const maxY = Math.floor((item.y + radius) / this.cellSize);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const key = `${x},${y}`;
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push(item);
      }
    }
  }

  forEachInCircle(x, y, radius, visit) {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    const stamp = this.queryStamp++;
    if (this.queryStamp > 1000000000) this.queryStamp = 1;
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.cells.get(`${cx},${cy}`);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const item = bucket[i];
          if (item._spatialStamp === stamp) continue;
          item._spatialStamp = stamp;
          visit(item);
        }
      }
    }
  }
}

globalThis.CellSpatial = {
  SpatialHash,
};
})();
