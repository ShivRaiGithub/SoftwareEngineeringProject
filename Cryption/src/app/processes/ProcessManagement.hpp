#ifndef PROCESS_MANAGEMENT_HPP
#define PROCESS_MANAGEMENT_HPP

#include "Task.hpp"
#include <queue>
#include <memory>
#include <mutex>
#include <semaphore.h>
#include <iostream>

class ProcessManagement {
    sem_t* itemsSemaphore;
    sem_t* emptySlotsSemaphore;

public: 
    ProcessManagement();
    ~ProcessManagement();
    bool submitToQueue(std::unique_ptr<Task> task);
    void executeTasks();

private:
    struct SharedMemory {
        int size; // use plain int
        char tasks[1000][256];
        int front;
        int rear;

        void printSharedMemory() const {
            std::cout << "Size: " << size << std::endl;
        }
    };

    SharedMemory* sharedMem;
    int shmFd;
    const char* SHM_NAME = "/my_queue";
    std::mutex queueLock;

    std::queue<std::unique_ptr<Task>> taskQueue; // local queue if needed
};

#endif // PROCESS_MANAGEMENT_HPP
