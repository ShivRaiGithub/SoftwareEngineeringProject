#ifndef VFS_FILEOPS_H
#define VFS_FILEOPS_H

#include <string>

void CreateFile(const std::string& name);
void WriteFile(const std::string& name, const std::string& content);
void ReadFile(const std::string& name);
void SeekFile(const std::string& name, int position);
void UpdateFile(const std::string& name);
void DeleteFile(const std::string& name);
void ListFiles();

#endif
