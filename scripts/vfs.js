export class IDBManager {
    constructor() {
        this.db = null;
        this.queue = [];
        this.processing = false;
    }

    async open(version = 1) {
        if (this.db) return this.db;
        this.db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('dataStore', version);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('contentpool')) db.createObjectStore('contentpool', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('memory')) db.createObjectStore('memory', { keyPath: 'key' });
            };
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
        return this.db;
    }

    async flushMemory(memory) {
        const db = await this.open();
        const tx = db.transaction('memory', 'readwrite');
        const store = tx.objectStore('memory');
        const req = store.put({ key: 'memory', memory });
        return new Promise((resolve, reject) => {
            req.onsuccess = resolve;
            req.onerror = () => reject(req.error);
        });
    }

    async loadMemory() {
        const db = await this.open();
        const tx = db.transaction('memory', 'readonly');
        const store = tx.objectStore('memory');
        const req = store.get('memory');
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result ? req.result.memory : null);
            req.onerror = () => reject(req.error);
        });
    }

    async setMemory(mem) {
        return this.flushMemory({ ...mem }).catch(console.error);
    }

    async getFile(id) {
        const db = await this.open();
        const tx = db.transaction('contentpool', 'readonly');
        const store = tx.objectStore('contentpool');
        const req = store.get(id);
        return new Promise((resolve, reject) => {
            req.onsuccess = () => {
                if (req.result) resolve(req.result.value);
                else reject(new Error('File not found'));
            };
            req.onerror = () => reject(req.error);
        });
    }

    async setFile(id, file) {
        const db = await this.open();
        const tx = db.transaction('contentpool', 'readwrite');
        const store = tx.objectStore('contentpool');
        const req = store.put({ key: id, value: new Blob([file], { type: file.type || 'application/octet-stream' }) });
        return new Promise((resolve, reject) => {
            req.onsuccess = resolve;
            req.onerror = () => reject(req.error);
        });
    }

    async removeFile(id) {
        const db = await this.open();
        const tx = db.transaction('contentpool', 'readwrite');
        const store = tx.objectStore('contentpool');
        const req = store.delete(id);
        return new Promise((resolve, reject) => {
            req.onsuccess = resolve;
            req.onerror = () => reject(req.error);
        });
    }

    async enqueue(action, args) {
        return new Promise((resolve, reject) => {
            this.queue.push({ resolve, reject, action, args });
            this.process();
        });
    }

    async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;
        while (this.queue.length) {
            const { resolve, reject, action, args } = this.queue.shift();
            try {
                const res = await action.apply(this, args);
                resolve(res);
            } catch (e) {
                reject(e);
            }
        }
        this.processing = false;
    }
}

export class VFS {
    constructor(idb) {
        this.idb = new IDBManager;
    }

    async _getMemory() {
        const mem = await this.idb.loadMemory();
        if (!mem) {
            const root = { type: 'folder', children: {} };
            await this.idb.setMemory({ '/': root });
            return { '/': root };
        }
        return mem;
    }

    async _saveMemory(mem) {
        await this.idb.setMemory(mem);
    }

    _resolvePath(path) {
        const parts = path.split('/').filter(Boolean);
        return parts;
    }

    _getFolder(mem, dirParts, create = false) {
        let current = mem['/'];
        for (const part of dirParts) {
            if (!current.children[part]) {
                if (!create) return null;
                current.children[part] = { type: 'folder', children: {} };
            }
            current = current.children[part];
            if (current.type !== 'folder') return null;
        }
        return current;
    }

    async setFile({ dir, name, content }) {
        const mem = await this._getMemory();
        const parts = this._resolvePath(dir);
        const folder = this._getFolder(mem, parts, true);
        folder.children[name] = { type: 'file' };
        const fullPath = (dir + '/' + name).replace(/\/+/g, '/');
        await this.idb.setFile(fullPath, content);
        await this._saveMemory(mem);
    }

    async getFile({ dir, name }) {
        const path = (dir + '/' + name).replace(/\/+/g, '/');
        return this.idb.getFile(path);
    }

    async listFolder({ dir }) {
        const mem = await this._getMemory();
        const parts = this._resolvePath(dir);
        const folder = this._getFolder(mem, parts);
        if (!folder) throw new Error('Folder not found');
        const result = {};
        const traverse = (base, obj) => {
            for (const [key, val] of Object.entries(obj.children)) {
                const p = base + '/' + key;
                result[p] = val.type;
                if (val.type === 'folder') traverse(p, val);
            }
        };
        traverse(dir.replace(/\/+$/, '') || '/', folder);
        return result;
    }

    async newFolder({ dir, name }) {
        const mem = await this._getMemory();
        const parts = this._resolvePath(dir);
        const folder = this._getFolder(mem, parts, true);
        if (folder.children[name]) throw new Error('Folder already exists');
        folder.children[name] = { type: 'folder', children: {} };
        await this._saveMemory(mem);
    }

    async removeFolder({ dir }) {
        const mem = await this._getMemory();
        const parts = this._resolvePath(dir);
        const last = parts.pop();
        const parent = this._getFolder(mem, parts);
        if (!parent || !parent.children[last] || parent.children[last].type !== 'folder') throw new Error('Folder not found');
        delete parent.children[last];
        await this._saveMemory(mem);
    }

    async clearFolder({ dir }) {
        const mem = await this._getMemory();
        const parts = this._resolvePath(dir);
        const folder = this._getFolder(mem, parts);
        if (!folder) throw new Error('Folder not found');
        const collectPaths = (base, node) => {
            for (const [k, v] of Object.entries(node.children)) {
                const p = base + '/' + k;
                if (v.type === 'file') this.idb.removeFile(p);
                if (v.type === 'folder') collectPaths(p, v);
            }
        };
        collectPaths(dir.replace(/\/+$/, '') || '/', folder);
        folder.children = {};
        await this._saveMemory(mem);
    }

    async moveFile({ fromDir, fromName, toDir, toName }) {
        const content = await this.getFile({ dir: fromDir, name: fromName });
        await this.setFile({ dir: toDir, name: toName, content });
        await this.removeFile({ dir: fromDir, name: fromName });
    }

    async copyFile({ fromDir, fromName, toDir, toName }) {
        const mem = await this._getMemory();
        const parts = this._resolvePath(toDir);
        const folder = this._getFolder(mem, parts, true);
        let name = toName;
        let i = 1;
        while (folder.children[name]) {
            const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
            const base = name.replace(/\[\d+\]$/, '').replace(ext, '');
            name = `${base}[${i++}]${ext}`;
        }
        const content = await this.getFile({ dir: fromDir, name: fromName });
        await this.setFile({ dir: toDir, name, content });
    }

    async removeFile({ dir, name }) {
        const mem = await this._getMemory();
        const parts = this._resolvePath(dir);
        const folder = this._getFolder(mem, parts);
        if (!folder || !folder.children[name]) throw new Error('File not found');
        delete folder.children[name];
        const path = (dir + '/' + name).replace(/\/+/g, '/');
        await this.idb.removeFile(path);
        await this._saveMemory(mem);
    }
}
