#ifndef INODE_H
#define INODE_H

#include <string>
const int MAX_FILES = 100;
const int FILE_SIZE = 1024;
const int DISK_SIZE = MAX_FILES * FILE_SIZE;
const std::string DISK_NAME = "vfs_disk.img";

struct Inode {
    char fileName[100];
    int startBlock;
    int size;
    int cursor;
    bool used;
};

#endif
