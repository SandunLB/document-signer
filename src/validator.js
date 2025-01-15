// validator.js
import CryptoJS from 'crypto-js';
import { PDFDocument } from 'pdf-lib';

document.addEventListener('DOMContentLoaded', function() {
    const validateBtn = document.getElementById('validate-btn');
    validateBtn.addEventListener('click', handleValidation);
});

async function handleValidation() {
    const fileInput = document.getElementById('validation-upload');
    const file = fileInput.files[0];
    
    if (!file || file.type !== 'application/pdf') {
        alert('Please upload a PDF file');
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.remove('hidden');
    loadingOverlay.style.display = 'flex';

    try {
        // Calculate hash of uploaded document
        const arrayBuffer = await file.arrayBuffer();
        const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
        const hash = CryptoJS.SHA256(wordArray).toString();

        // Create form data
        const formData = new FormData();
        formData.append('pdf', file);
        formData.append('hash', hash);

        // Send to backend for verification
        const response = await fetch('../verify_document.php', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Verification request failed');
        }

        const result = await response.json();
        displayResults(result);
        
    } catch (error) {
        console.error('Validation error:', error);
        alert('Error validating document. Please try again.');
    } finally {
        loadingOverlay.classList.add('hidden');
        loadingOverlay.style.display = 'none';
    }
}

function displayResults(result) {
    const resultCard = document.getElementById('result-card');
    const statusIcon = document.getElementById('status-icon');
    const resultTitle = document.getElementById('result-title');
    const docAuthor = document.getElementById('doc-author');
    const docTimestamp = document.getElementById('doc-timestamp');
    const docFilename = document.getElementById('doc-filename');
    const docHash = document.getElementById('doc-hash');

    // Update result card style and content
    resultCard.style.display = 'block';
    resultCard.className = 'result-card ' + (result.valid ? 'valid' : 'invalid');
    
    // Update status icon and title
    statusIcon.textContent = result.valid ? '✓' : '✗';
    statusIcon.className = result.valid ? 'text-green-600' : 'text-red-600';
    
    resultTitle.textContent = result.valid ? 
        'Document is authentic' : 
        'Document validation failed';
    resultTitle.className = 'text-xl font-semibold ' + 
        (result.valid ? 'text-green-800' : 'text-red-800');

    // Update metadata if available
    if (result.metadata) {
        docAuthor.textContent = result.metadata.author;
        docTimestamp.textContent = new Date(result.metadata.timestamp).toLocaleString();
        docFilename.textContent = result.metadata.original_filename;
        docHash.textContent = result.metadata.hash;
    }
}