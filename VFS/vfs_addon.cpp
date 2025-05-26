#include <node.h>
#include <node_buffer.h>
#include <v8.h>
#include "vfs_disk.h"
#include "vfs_fileops.h"
#include "vfs_utils.h"
#include <iostream>
#include <sstream>

using namespace v8;

// Initialize VFS
void InitVFS(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    LoadDisk();
    args.GetReturnValue().Set(Boolean::New(isolate, true));
}

// Save VFS to disk
void SaveVFS(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    SaveDisk();
    args.GetReturnValue().Set(Boolean::New(isolate, true));
}

// Create file in VFS
void VFSCreateFile(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    
    if (args.Length() < 1 || !args[0]->IsString()) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Filename required").ToLocalChecked()));
        return;
    }
    
    String::Utf8Value filename(isolate, args[0]);
    std::string name(*filename);
    
    // Check if file already exists
    if (FindFile(name) != -1) {
        args.GetReturnValue().Set(Boolean::New(isolate, false));
        return;
    }
    
    int idx = FindFreeInode();
    int block = FindFreeBlock();
    if (idx == -1 || block == -1) {
        args.GetReturnValue().Set(Boolean::New(isolate, false));
        return;
    }
    
    strncpy(inodeTable[idx].fileName, name.c_str(), 100);
    inodeTable[idx].startBlock = block;
    inodeTable[idx].size = 0;
    inodeTable[idx].cursor = 0;
    inodeTable[idx].used = true;
    SaveDisk();
    
    args.GetReturnValue().Set(Boolean::New(isolate, true));
}

// Write data to VFS file
void VFSWriteFile(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    
    if (args.Length() < 2 || !args[0]->IsString()) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Filename and data required").ToLocalChecked()));
        return;
    }
    
    String::Utf8Value filename(isolate, args[0]);
    std::string name(*filename);
    
    int idx = FindFile(name);
    if (idx == -1) {
        args.GetReturnValue().Set(Boolean::New(isolate, false));
        return;
    }
    
    // Handle Buffer data
    if (node::Buffer::HasInstance(args[1])) {
        char* data = node::Buffer::Data(args[1]);
        size_t length = node::Buffer::Length(args[1]);
        
        if (length > FILE_SIZE) {
            args.GetReturnValue().Set(Boolean::New(isolate, false));
            return;
        }
        
        int start = inodeTable[idx].startBlock;
        memcpy(&diskData[start], data, length);
        inodeTable[idx].size = length;
        inodeTable[idx].cursor = length;
        SaveDisk();
        args.GetReturnValue().Set(Boolean::New(isolate, true));
    }
    // Handle String data
    else if (args[1]->IsString()) {
        String::Utf8Value content(isolate, args[1]);
        std::string data(*content);
        
        if (data.size() > FILE_SIZE) {
            args.GetReturnValue().Set(Boolean::New(isolate, false));
            return;
        }
        
        int start = inodeTable[idx].startBlock;
        memcpy(&diskData[start], data.c_str(), data.size());
        inodeTable[idx].size = data.size();
        inodeTable[idx].cursor = data.size();
        SaveDisk();
        args.GetReturnValue().Set(Boolean::New(isolate, true));
    }
    else {
        args.GetReturnValue().Set(Boolean::New(isolate, false));
    }
}

// Read file from VFS
void VFSReadFile(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    
    if (args.Length() < 1 || !args[0]->IsString()) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Filename required").ToLocalChecked()));
        return;
    }
    
    String::Utf8Value filename(isolate, args[0]);
    std::string name(*filename);
    
    int idx = FindFile(name);
    if (idx == -1) {
        args.GetReturnValue().Set(Null(isolate));
        return;
    }
    
    int start = inodeTable[idx].startBlock;
    int size = inodeTable[idx].size;
    
    // Return as Buffer to preserve binary data
    Local<Object> buffer = node::Buffer::Copy(isolate, 
        reinterpret_cast<const char*>(&diskData[start]), size).ToLocalChecked();
    args.GetReturnValue().Set(buffer);
}

// Delete file from VFS
void VFSDeleteFile(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    
    if (args.Length() < 1 || !args[0]->IsString()) {
        isolate->ThrowException(Exception::TypeError(
            String::NewFromUtf8(isolate, "Filename required").ToLocalChecked()));
        return;
    }
    
    String::Utf8Value filename(isolate, args[0]);
    std::string name(*filename);
    
    int idx = FindFile(name);
    if (idx == -1) {
        args.GetReturnValue().Set(Boolean::New(isolate, false));
        return;
    }
    
    inodeTable[idx].used = false;
    inodeTable[idx].size = 0;
    inodeTable[idx].cursor = 0;
    memset(&diskData[inodeTable[idx].startBlock], 0, FILE_SIZE);
    SaveDisk();
    
    args.GetReturnValue().Set(Boolean::New(isolate, true));
}

// List files in VFS
void VFSListFiles(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    Local<Context> context = isolate->GetCurrentContext();
    
    Local<Array> files = Array::New(isolate);
    int fileCount = 0;
    
    for (int i = 0; i < MAX_FILES; ++i) {
        if (inodeTable[i].used) {
            Local<Object> fileInfo = Object::New(isolate);
            fileInfo->Set(context, 
                String::NewFromUtf8(isolate, "name").ToLocalChecked(),
                String::NewFromUtf8(isolate, inodeTable[i].fileName).ToLocalChecked());
            fileInfo->Set(context,
                String::NewFromUtf8(isolate, "size").ToLocalChecked(),
                Number::New(isolate, inodeTable[i].size));
            fileInfo->Set(context,
                String::NewFromUtf8(isolate, "cursor").ToLocalChecked(),
                Number::New(isolate, inodeTable[i].cursor));
            
            files->Set(context, fileCount++, fileInfo);
        }
    }
    
    args.GetReturnValue().Set(files);
}

// Check if file exists in VFS
void VFSFileExists(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    
    if (args.Length() < 1 || !args[0]->IsString()) {
        args.GetReturnValue().Set(Boolean::New(isolate, false));
        return;
    }
    
    String::Utf8Value filename(isolate, args[0]);
    std::string name(*filename);
    
    int idx = FindFile(name);
    args.GetReturnValue().Set(Boolean::New(isolate, idx != -1));
}

// Initialize the addon
void Initialize(Local<Object> exports) {
    NODE_SET_METHOD(exports, "initVFS", InitVFS);
    NODE_SET_METHOD(exports, "saveVFS", SaveVFS);
    NODE_SET_METHOD(exports, "createFile", VFSCreateFile);
    NODE_SET_METHOD(exports, "writeFile", VFSWriteFile);
    NODE_SET_METHOD(exports, "readFile", VFSReadFile);
    NODE_SET_METHOD(exports, "deleteFile", VFSDeleteFile);
    NODE_SET_METHOD(exports, "listFiles", VFSListFiles);
    NODE_SET_METHOD(exports, "fileExists", VFSFileExists);
}

NODE_MODULE(vfs_addon, Initialize)