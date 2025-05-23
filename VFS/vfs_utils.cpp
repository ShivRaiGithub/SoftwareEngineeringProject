#include "vfs_utils.h"
#include "vfs_disk.h"
#include <string>

int FindFreeInode() {
    for (int i = 0; i < MAX_FILES; ++i) {
        if (!inodeTable[i].used) return i;
    }
    return -1;
}

int FindFreeBlock() {
    for (int i = 0; i < MAX_FILES; ++i) {
        if (!inodeTable[i].used) return i * FILE_SIZE;
    }
    return -1;
}

int FindFile(const std::string& name) {
    for (int i = 0; i < MAX_FILES; ++i) {
        if (inodeTable[i].used && name == inodeTable[i].fileName) return i;
    }
    return -1;
}
