const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function createSeedFile(filename, content) {
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
  return fs.statSync(filePath).size;
}

const seedJavaSize = createSeedFile('seed_graph.java', `// GraphAlgorithm.java - SRKR Lab
import java.util.*;

public class GraphAlgorithm {
    private int V;
    private LinkedList<Integer> adj[];

    public GraphAlgorithm(int v) {
        V = v;
        adj = new LinkedList[v];
        for (int i = 0; i < v; ++i)
            adj[i] = new LinkedList();
    }

    public void addEdge(int v, int w) {
        adj[v].add(w);
    }

    public void BFS(int s) {
        boolean visited[] = new boolean[V];
        LinkedList<Integer> queue = new LinkedList<Integer>();
        visited[s] = true;
        queue.add(s);

        while (queue.size() != 0) {
            s = queue.poll();
            System.out.print(s + " ");
            for (int n : adj[s]) {
                if (!visited[n]) {
                    visited[n] = true;
                    queue.add(n);
                }
            }
        }
    }

    public static void main(String args[]) {
        GraphAlgorithm g = new GraphAlgorithm(4);
        g.addEdge(0, 1);
        g.addEdge(0, 2);
        g.addEdge(1, 2);
        g.addEdge(2, 0);
        g.addEdge(2, 3);
        g.addEdge(3, 3);

        System.out.println("Breadth First Traversal starting from vertex 2:");
        g.BFS(2);
    }
}`);

const seedBubbleSize = createSeedFile('seed_bubblesort.java', `// BubbleSort.java
public class BubbleSort {
    public static void main(String[] args) {
        int[] arr = {64, 34, 25, 12, 22, 11, 90};
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                }
            }
        }
        System.out.print("Sorted Array: ");
        for (int i : arr) System.out.print(i + " ");
        System.out.println();
    }
}`);

const seedPySize = createSeedFile('seed_python.py', `# QuickSort.py - SRKR Lab
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

if __name__ == "__main__":
    sample = [3, 6, 8, 10, 1, 2, 1]
    print("Original:", sample)
    print("Sorted:", quicksort(sample))
`);

const seedBinSearchPy = createSeedFile('seed_binary_search.py', `# BinarySearch.py
def binary_search(arr, target):
    low, high = 0, len(arr) - 1
    while low <= high:
        mid = (low + high) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1

arr = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
target = 23
result = binary_search(arr, target)
print(f"Element {target} found at index: {result}")
`);

const seedCSize = createSeedFile('seed_matrix.c', `/* MatrixMultiplication.c */
#include <stdio.h>

int main() {
    int r1 = 2, c1 = 2, r2 = 2, c2 = 2;
    int a[2][2] = {{1, 2}, {3, 4}};
    int b[2][2] = {{5, 6}, {7, 8}};
    int result[2][2] = {0};

    for (int i = 0; i < r1; ++i) {
        for (int j = 0; j < c2; ++j) {
            for (int k = 0; k < c1; ++k) {
                result[i][j] += a[i][k] * b[k][j];
            }
        }
    }

    printf("Product Matrix:\\n");
    for (int i = 0; i < r1; ++i) {
        for (int j = 0; j < c2; ++j) {
            printf("%d ", result[i][j]);
        }
        printf("\\n");
    }
    return 0;
}
`);

const seedCppSize = createSeedFile('seed_vector.cpp', `// VectorOperations.cpp
#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

int main() {
    vector<int> nums = {45, 12, 85, 32, 89, 39, 69, 44};
    sort(nums.begin(), nums.end());

    cout << "Sorted Numbers: ";
    for (int n : nums) cout << n << " ";
    cout << endl;
    return 0;
}
`);

const seedDocSize = createSeedFile('seed_notes.txt', `ZipShare - Student File Sharing Platform Notes
=================================================
Course: CS301 - Data Structures & Algorithms
Topic: Binary Search Trees & AVL Balancing

Key Operations:
1. Insertion: O(log N)
2. Deletion: O(log N)
3. Search: O(log N)
`);

const seedFolderFile1 = createSeedFile('folder_arraylist.java', `// ArrayList.java
import java.util.ArrayList;

public class ArrayListExample {
    public static void main(String[] args) {
        ArrayList<String> list = new ArrayList<>();
        list.add("Java");
        list.add("Python");
        list.add("C++");
        System.out.println("Programming Languages: " + list);
    }
}`);

const seedFolderFile2 = createSeedFile('folder_hashmap.java', `// HashMap.java
import java.util.HashMap;

public class HashMapExample {
    public static void main(String[] args) {
        HashMap<String, Integer> map = new HashMap<>();
        map.put("Alice", 95);
        map.put("Bob", 88);
        System.out.println("Student Grades: " + map);
    }
}`);

const inMemoryFiles = [
  {
    _id: 'seed-file-1',
    originalName: 'GraphAlgorithm.java',
    storedName: 'seed_graph.java',
    relativePath: 'GraphAlgorithm.java',
    folderName: null,
    batchId: null,
    extension: 'java',
    size: seedJavaSize,
    subject: 'Java',
    exercise: 'Exercise 3',
    question: 'Question 2: Breadth First Search Traversal',
    description: 'Graph BFS implementation in Java for CS202 Lab',
    expectedOutput: 'Breadth First Traversal starting from vertex 2:\n2 0 3 1',
    algorithm: '1. Create a queue and visited array\n2. Enqueue start node and mark visited\n3. Dequeue and process neighbors',
    complexity: 'Time: O(V + E) | Space: O(V)',
    difficulty: 'Medium',
    tags: ['java', 'graph', 'bfs', 'lab'],
    pinned: true,
    downloads: 24,
    uploadDate: new Date(Date.now() - 3600000 * 2)
  },
  {
    _id: 'seed-file-2',
    originalName: 'BubbleSort.java',
    storedName: 'seed_bubblesort.java',
    relativePath: 'BubbleSort.java',
    folderName: null,
    batchId: null,
    extension: 'java',
    size: seedBubbleSize,
    subject: 'Java',
    exercise: 'Exercise 1',
    question: 'Question 1: Sort array using Bubble Sort',
    description: 'Demonstrates adjacent swapping to sort integer arrays in Java.',
    expectedOutput: 'Sorted Array: 11 12 22 25 34 64 90',
    algorithm: '1. Compare adjacent elements\n2. Swap if out of order\n3. Repeat for n passes',
    complexity: 'Time: O(N^2) | Space: O(1)',
    difficulty: 'Easy',
    tags: ['java', 'sorting', 'lab1'],
    pinned: true,
    downloads: 18,
    uploadDate: new Date(Date.now() - 3600000 * 3)
  },
  {
    _id: 'seed-file-3',
    originalName: 'QuickSort.py',
    storedName: 'seed_python.py',
    relativePath: 'QuickSort.py',
    folderName: null,
    batchId: null,
    extension: 'py',
    size: seedPySize,
    subject: 'Python',
    exercise: 'Exercise 2',
    question: 'Question 1: Divide and conquer QuickSort',
    description: 'Python implementation of QuickSort algorithm using list comprehensions.',
    expectedOutput: 'Original: [3, 6, 8, 10, 1, 2, 1]\nSorted: [1, 1, 2, 3, 6, 8, 10]',
    algorithm: '1. Select pivot element\n2. Partition into smaller, equal, larger lists\n3. Recursively sort partitions',
    complexity: 'Time: O(N log N) | Space: O(N)',
    difficulty: 'Medium',
    tags: ['python', 'sorting', 'divide-and-conquer'],
    pinned: true,
    downloads: 32,
    uploadDate: new Date(Date.now() - 3600000 * 5)
  },
  {
    _id: 'seed-file-4',
    originalName: 'BinarySearch.py',
    storedName: 'seed_binary_search.py',
    relativePath: 'BinarySearch.py',
    folderName: null,
    batchId: null,
    extension: 'py',
    size: seedBinSearchPy,
    subject: 'Python',
    exercise: 'Exercise 1',
    question: 'Question 2: Logarithmic binary search in sorted list',
    description: 'Finds target index in a sorted list using binary search algorithm.',
    expectedOutput: 'Element 23 found at index: 5',
    algorithm: '1. Set low and high pointers\n2. Compute mid index\n3. Adjust pointers based on comparison',
    complexity: 'Time: O(log N) | Space: O(1)',
    difficulty: 'Easy',
    tags: ['python', 'searching', 'binarysearch'],
    pinned: false,
    downloads: 14,
    uploadDate: new Date(Date.now() - 3600000 * 6)
  },
  {
    _id: 'seed-file-5',
    originalName: 'MatrixMultiplication.c',
    storedName: 'seed_matrix.c',
    relativePath: 'MatrixMultiplication.c',
    folderName: null,
    batchId: null,
    extension: 'c',
    size: seedCSize,
    subject: 'C',
    exercise: 'Exercise 1',
    question: 'Question 1: Multiply two 2x2 matrices',
    description: 'C program multiplying two 2D integer arrays using triple nested loops.',
    expectedOutput: 'Product Matrix:\n19 22 \n43 50 ',
    algorithm: '1. Validate matrix dimensions\n2. Multiply row elements with column elements\n3. Accumulate sum in result matrix',
    complexity: 'Time: O(N^3) | Space: O(N^2)',
    difficulty: 'Easy',
    tags: ['c', 'matrix', 'arrays'],
    pinned: false,
    downloads: 21,
    uploadDate: new Date(Date.now() - 3600000 * 8)
  },
  {
    _id: 'seed-file-6',
    originalName: 'VectorOperations.cpp',
    storedName: 'seed_vector.cpp',
    relativePath: 'VectorOperations.cpp',
    folderName: null,
    batchId: null,
    extension: 'cpp',
    size: seedCppSize,
    subject: 'C++',
    exercise: 'Exercise 2',
    question: 'Question 1: Dynamic arrays with STL Vector',
    description: 'C++ STL std::vector manipulation and sorting example.',
    expectedOutput: 'Sorted Numbers: 12 32 39 44 45 69 85 89',
    algorithm: '1. Populate std::vector\n2. Apply std::sort algorithm\n3. Iterate and display sorted elements',
    complexity: 'Time: O(N log N) | Space: O(N)',
    difficulty: 'Easy',
    tags: ['cpp', 'stl', 'vectors'],
    pinned: false,
    downloads: 15,
    uploadDate: new Date(Date.now() - 3600000 * 10)
  },
  {
    _id: 'seed-file-7',
    originalName: 'CS301_AVL_Notes.txt',
    storedName: 'seed_notes.txt',
    relativePath: 'CS301_AVL_Notes.txt',
    folderName: null,
    batchId: null,
    extension: 'txt',
    size: seedDocSize,
    subject: 'ADSA',
    exercise: 'Exercise 4',
    question: 'Question 1: AVL Tree Balancing Notes',
    description: 'Lecture notes on AVL Tree rotations and height balance.',
    expectedOutput: 'AVL Rotations: LL, RR, LR, RL',
    algorithm: 'Check balance factor = height(left) - height(right)',
    complexity: 'Time: O(log N) | Space: O(N)',
    difficulty: 'Medium',
    tags: ['notes', 'avl', 'trees', 'adsa'],
    pinned: true,
    downloads: 19,
    uploadDate: new Date(Date.now() - 3600000 * 12)
  },
  {
    _id: 'seed-file-8',
    originalName: 'ArrayListExample.java',
    storedName: 'folder_arraylist.java',
    relativePath: 'Java_Collection_Lab/ArrayListExample.java',
    folderName: 'Java_Collection_Lab',
    batchId: 'batch-folder-101',
    extension: 'java',
    size: seedFolderFile1,
    subject: 'Java',
    exercise: 'Exercise 2',
    question: 'Question 1: Collections Framework ArrayList',
    description: 'Dynamic resizing array list operations in Java.',
    expectedOutput: 'Programming Languages: [Java, Python, C++]',
    algorithm: '1. Instantiate ArrayList\n2. Add elements\n3. Print list contents',
    complexity: 'Time: O(1) amortized | Space: O(N)',
    difficulty: 'Easy',
    tags: ['java', 'collections', 'arraylist'],
    pinned: false,
    downloads: 11,
    uploadDate: new Date(Date.now() - 3600000 * 4)
  },
  {
    _id: 'seed-file-9',
    originalName: 'HashMapExample.java',
    storedName: 'folder_hashmap.java',
    relativePath: 'Java_Collection_Lab/HashMapExample.java',
    folderName: 'Java_Collection_Lab',
    batchId: 'batch-folder-101',
    extension: 'java',
    size: seedFolderFile2,
    subject: 'Java',
    exercise: 'Exercise 2',
    question: 'Question 2: Key-Value Mapping with HashMap',
    description: 'Demonstrates key-value storage and lookup using Java HashMap.',
    expectedOutput: 'Student Grades: {Bob=88, Alice=95}',
    algorithm: '1. Compute hash code for keys\n2. Store in bucket\n3. Retrieve value in O(1)',
    complexity: 'Time: O(1) average | Space: O(N)',
    difficulty: 'Easy',
    tags: ['java', 'collections', 'hashmap'],
    pinned: false,
    downloads: 9,
    uploadDate: new Date(Date.now() - 3600000 * 4)
  }
];

const inMemorySuggestions = [
  { _id: 'sug-1', text: 'Java Lab Exercises', type: 'manual', pinned: true, order: 1, createdAt: new Date() },
  { _id: 'sug-2', text: 'Python QuickSort & BinarySearch', type: 'manual', pinned: true, order: 2, createdAt: new Date() },
  { _id: 'sug-3', text: 'C Matrix Multiplication', type: 'manual', pinned: false, order: 3, createdAt: new Date() }
];

module.exports = {
  inMemoryFiles,
  inMemorySuggestions,
  UPLOAD_DIR
};
