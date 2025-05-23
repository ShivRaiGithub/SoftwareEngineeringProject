#include "vfs_disk.h"
#include <fstream>
std::vector<Inode> inodeTable(MAX_FILES);
std::vector<char> diskData(DISK_SIZE, 0);

void LoadDisk() {
    std::ifstream fin(DISK_NAME, std::ios::binary);
    if (fin) {
        fin.read(reinterpret_cast<char*>(&inodeTable[0]), sizeof(Inode) * MAX_FILES);
        fin.read(&diskData[0], DISK_SIZE);
        fin.close();
    }
}

void SaveDisk() {
    std::ofstream fout(DISK_NAME, std::ios::binary);
    fout.write(reinterpret_cast<const char*>(&inodeTable[0]), sizeof(Inode) * MAX_FILES);
    fout.write(&diskData[0], DISK_SIZE);
    fout.close();
}
