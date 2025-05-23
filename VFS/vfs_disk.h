#ifndef VFS_DISK_H
#define VFS_DISK_H

#include <vector>
#include "inode.h"

extern std::vector<Inode> inodeTable;
extern std::vector<char> diskData;

void LoadDisk();
void SaveDisk();

#endif
