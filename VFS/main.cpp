#include "vfs_shell.h"
#include "vfs_disk.h"

int main() {
    LoadDisk();     // Load existing disk data and inodes
    Shell();        // Start the shell for user interaction
    SaveDisk();     // Save any final changes before exiting
    return 0;
}
