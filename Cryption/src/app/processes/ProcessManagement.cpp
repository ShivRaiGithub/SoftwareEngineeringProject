#include "ProcessManagement.hpp"
#include <iostream>
#include <cstring>
#include <sys/wait.h>
#include "../encryptDecrypt/Cryption.hpp"
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>

ProcessManagement::ProcessManagement() {
    itemsSemaphore = sem_open("/items_semaphore", O_CREAT, 0666, 0);
    emptySlotsSemaphore = sem_open("/empty_slots_sempahore", O_CREAT, 0666, 1000);

    shmFd = shm_open(SHM_NAME, O_CREAT | O_RDWR, 0666);
    ftruncate(shmFd, sizeof(SharedMemory));
    sharedMem = static_cast<SharedMemory*>(
        mmap(nullptr, sizeof(SharedMemory), PROT_READ | PROT_WRITE, MAP_SHARED, shmFd, 0));

    sharedMem->front = 0;
    sharedMem->rear = 0;
    sharedMem->size = 0;
}

bool ProcessManagement::submitToQueue(std::unique_ptr<Task> task) {
    sem_wait(emptySlotsSemaphore);
    std::unique_lock<std::mutex> lock(queueLock);

    if (sharedMem->size >= 1000) {
        return false;
    }

    strncpy(sharedMem->tasks[sharedMem->rear], task->toString().c_str(), sizeof(sharedMem->tasks[sharedMem->rear]) - 1);
    sharedMem->tasks[sharedMem->rear][sizeof(sharedMem->tasks[sharedMem->rear]) - 1] = '\0';

    sharedMem->rear = (sharedMem->rear + 1) % 1000;
    sharedMem->size += 1;

    lock.unlock();
    sem_post(itemsSemaphore);

    int pid = fork();
    if (pid < 0) {
        return false;
    } else if (pid == 0) {
        std::cout << "Entering the child process" << std::endl;
        executeTasks();
        std::cout << "Exiting the child process" << std::endl;
        _exit(0); // Proper exit in child
    } else {
        std::cout << "Entering the parent process" << std::endl;
    }

    return true;
}

void ProcessManagement::executeTasks() {
    sem_wait(itemsSemaphore);
    std::unique_lock<std::mutex> lock(queueLock);

    char taskStr[256];
    strncpy(taskStr, sharedMem->tasks[sharedMem->front], sizeof(taskStr) - 1);
    taskStr[sizeof(taskStr) - 1] = '\0';

    sharedMem->front = (sharedMem->front + 1) % 1000;
    sharedMem->size -= 1;

    lock.unlock();
    sem_post(emptySlotsSemaphore);

    std::cout << "Executing child process" << std::endl;
    executeCryption(taskStr);
}

ProcessManagement::~ProcessManagement() {
    munmap(sharedMem, sizeof(SharedMemory));
    shm_unlink(SHM_NAME);

    sem_close(itemsSemaphore);
    sem_unlink("/items_semaphore");
    sem_close(emptySlotsSemaphore);
    sem_unlink("/empty_slots_sempahore");
}
