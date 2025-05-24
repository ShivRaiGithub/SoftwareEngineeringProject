#include <openssl/evp.h>
#include <openssl/rand.h>
#include <fstream>
#include <vector>
#include <cstring>
#include "../processes/Task.hpp"
#include "../fileHandling/ReadEnv.cpp"

const int AES_KEY_LENGTH = 32; // AES-256
const int AES_BLOCK_SIZE = 16;

bool aesEncrypt(std::vector<unsigned char>& plaintext, std::vector<unsigned char>& ciphertext, const unsigned char* key, unsigned char* iv) {
    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    int len;
    int ciphertext_len;

    if (!EVP_EncryptInit_ex(ctx, EVP_aes_256_cbc(), nullptr, key, iv)) return false;

    ciphertext.resize(plaintext.size() + AES_BLOCK_SIZE);
    if (!EVP_EncryptUpdate(ctx, ciphertext.data(), &len, plaintext.data(), plaintext.size())) return false;

    ciphertext_len = len;

    if (!EVP_EncryptFinal_ex(ctx, ciphertext.data() + len, &len)) return false;
    ciphertext_len += len;

    ciphertext.resize(ciphertext_len);
    EVP_CIPHER_CTX_free(ctx);
    return true;
}

bool aesDecrypt(std::vector<unsigned char>& ciphertext, std::vector<unsigned char>& plaintext, const unsigned char* key, unsigned char* iv) {
    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    int len;
    int plaintext_len;

    if (!EVP_DecryptInit_ex(ctx, EVP_aes_256_cbc(), nullptr, key, iv)) return false;

    plaintext.resize(ciphertext.size());
    if (!EVP_DecryptUpdate(ctx, plaintext.data(), &len, ciphertext.data(), ciphertext.size())) return false;

    plaintext_len = len;

    if (!EVP_DecryptFinal_ex(ctx, plaintext.data() + len, &len)) return false;
    plaintext_len += len;

    plaintext.resize(plaintext_len);
    EVP_CIPHER_CTX_free(ctx);
    return true;
}

int executeCryption(const std::string& taskData) {
    Task task = Task::fromString(taskData);
    ReadEnv env;
    std::string envKey = env.getenv();

    if (envKey.size() < AES_KEY_LENGTH) {
        std::cerr << "Key must be at least 32 bytes for AES-256.\n";
        return 1;
    }

    std::ifstream inputFile(task.filePath, std::ios::binary);
    std::vector<unsigned char> buffer((std::istreambuf_iterator<char>(inputFile)), {});
    inputFile.close();

    std::vector<unsigned char> result;
    unsigned char key[AES_KEY_LENGTH];
    memcpy(key, envKey.c_str(), AES_KEY_LENGTH);
    unsigned char iv[AES_BLOCK_SIZE];

    if (task.action == Action::ENCRYPT) {
        RAND_bytes(iv, AES_BLOCK_SIZE);  // Generate random IV
        if (!aesEncrypt(buffer, result, key, iv)) {
            std::cerr << "Encryption failed.\n";
            return 1;
        }

        std::ofstream outputFile(task.filePath, std::ios::binary);
        outputFile.write(reinterpret_cast<char*>(iv), AES_BLOCK_SIZE); // Save IV at beginning
        outputFile.write(reinterpret_cast<char*>(result.data()), result.size());
        outputFile.close();
    } else {
        memcpy(iv, buffer.data(), AES_BLOCK_SIZE); // Extract IV
        buffer.erase(buffer.begin(), buffer.begin() + AES_BLOCK_SIZE);

        if (!aesDecrypt(buffer, result, key, iv)) {
            std::cerr << "Decryption failed.\n";
            return 1;
        }

        std::ofstream outputFile(task.filePath, std::ios::binary);
        outputFile.write(reinterpret_cast<char*>(result.data()), result.size());
        outputFile.close();
    }

    return 0;
}
