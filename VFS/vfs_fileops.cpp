#include "vfs_fileops.h"
#include "vfs_utils.h"
#include "vfs_disk.h"
#include <iostream>
#include <cstring>
#include <algorithm>

using namespace std;

void CreateFile(const string& name) {
    if (FindFile(name) != -1) {
        cout << "Error: File already exists.\n";
        return;
    }
    int idx = FindFreeInode();
    int block = FindFreeBlock();
    if (idx == -1 || block == -1) {
        cout << "Error: Disk full or inode table full.\n";
        return;
    }
    strncpy(inodeTable[idx].fileName, name.c_str(), 100);
    inodeTable[idx].startBlock = block;
    inodeTable[idx].size = 0;
    inodeTable[idx].cursor = 0;
    inodeTable[idx].used = true;
    SaveDisk();
    cout << "File created.\n";
}

void WriteFile(const string& name, const string& content) {
    int idx = FindFile(name);
    if (idx == -1) {
        cout << "Error: File not found.\n";
        return;
    }
    if (content.size() > FILE_SIZE) {
        cout << "Error: Content too large.\n";
        return;
    }
    int start = inodeTable[idx].startBlock + inodeTable[idx].cursor;
    int remaining = FILE_SIZE - inodeTable[idx].cursor;
    int toWrite = min((int)content.size(), remaining);
    memcpy(&diskData[start], content.c_str(), toWrite);
    inodeTable[idx].cursor += toWrite;
    inodeTable[idx].size = max(inodeTable[idx].size, inodeTable[idx].cursor);
    SaveDisk();
    cout << "Write complete.\n";
}

void ReadFile(const string& name) {
    int idx = FindFile(name);
    if (idx == -1) {
        cout << "Error: File not found.\n";
        return;
    }
    int start = inodeTable[idx].startBlock;
    int size = inodeTable[idx].size;
    string content(diskData.begin() + start, diskData.begin() + start + size);
    cout << "Content: " << content << "\n";
}

void SeekFile(const string& name, int position) {
    int idx = FindFile(name);
    if (idx == -1) {
        cout << "Error: File not found.\n";
        return;
    }
    if (position < 0 || position >= FILE_SIZE) {
        cout << "Error: Invalid seek position.\n";
        return;
    }
    inodeTable[idx].cursor = position;
    cout << "Cursor moved to position " << position << ".\n";
    SaveDisk();
}

void UpdateFile(const string& name) {
    int idx = FindFile(name);
    if (idx == -1) {
        cout << "Error: File not found.\n";
        return;
    }

    int start = inodeTable[idx].startBlock;
    int size = inodeTable[idx].size;

    string currentContent(diskData.begin() + start, diskData.begin() + start + size);
    cout << "Current content: \n" << currentContent << "\n";

    cout << "Enter the text to replace: ";
    string oldText;
    getline(cin, oldText);

    if (currentContent.find(oldText) == string::npos) {
        cout << "Error: Text to replace not found.\n";
        return;
    }

    cout << "Enter the new text: ";
    string newText;
    getline(cin, newText);

    if (currentContent.size() - oldText.size() + newText.size() > FILE_SIZE) {
        cout << "Error: New content exceeds file size.\n";
        return;
    }

    size_t pos = currentContent.find(oldText);
    currentContent.replace(pos, oldText.size(), newText);

    memset(&diskData[start], 0, FILE_SIZE);
    memcpy(&diskData[start], currentContent.c_str(), currentContent.size());
    inodeTable[idx].size = currentContent.size();
    inodeTable[idx].cursor = currentContent.size();
    SaveDisk();
    cout << "File updated successfully.\n";
}

void DeleteFile(const string& name) {
    int idx = FindFile(name);
    if (idx == -1) {
        cout << "Error: File not found.\n";
        return;
    }
    inodeTable[idx].used = false;
    inodeTable[idx].size = 0;
    inodeTable[idx].cursor = 0;
    memset(&diskData[inodeTable[idx].startBlock], 0, FILE_SIZE);
    SaveDisk();
    cout << "File deleted.\n";
}

void ListFiles() {
    for (int i = 0; i < MAX_FILES; ++i) {
        if (inodeTable[i].used) {
            cout << inodeTable[i].fileName << " (size: " << inodeTable[i].size
                 << ", cursor: " << inodeTable[i].cursor << ")\n";
        }
    }
}
