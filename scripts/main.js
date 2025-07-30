import { IDBManager, VFS } from './vfs.js';

const idb = new IDBManager();

(async () => {
    const mem = await idb.loadMemory();
    if (!mem || !mem['/']) await firstTimeSetup();
})();

async function firstTimeSetup() {
    await idb.setMemory({ '/': { type: 'folder', children: {} } });
    // add additional setup logic here
}
