#ifndef VFS_UTIL_H
#define VFS_UTIL_H

#include <string>

int FindFreeInode();
int FindFreeBlock();
int FindFile(const std::string& name);

#endif
