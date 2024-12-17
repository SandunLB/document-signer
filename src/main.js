import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';

// Set worker path to local file
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.js';

let pdfDoc = null;
let currentPage = 1;
let signaturePad = null;
let currentScale = 1.5;

function adjustPath(path) {
    // If the path starts with '/', remove it since we're going up one level
    if (path.startsWith('/')) {
        path = path.substring(1);
    }
    // Go up one directory level since we're in doc_editor folder
    return '../' + path;
}

async function autoLoadDocument() {
    const documentPath = sessionStorage.getItem('documentToSign');
    
    if (!documentPath) return;
    
    try {
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.classList.remove('hidden');
        
        // Adjust the path to account for the doc_editor folder structure
        const adjustedPath = adjustPath(documentPath);
        
        // Load local file
        const response = await fetch(adjustedPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();
        
        // Create a File object from the blob
        const fileName = documentPath.split('/').pop() || 'document.pdf';
        const file = new File([blob], fileName, { type: 'application/pdf' });
        
        // Create a new FileList containing our File object
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        // Set the file input's files
        const fileInput = document.getElementById('document-upload');
        fileInput.files = dataTransfer.files;
        
        // Trigger the change event
        const event = new Event('change');
        fileInput.dispatchEvent(event);
        
        // Clear the session storage
        sessionStorage.removeItem('documentToSign');
        
    } catch (error) {
        console.error('Error auto-loading document:', error);
        alert('Error loading document. Please try again. Details: ' + error.message);
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize signature pad
    const canvas = document.getElementById('signature-pad');
    signaturePad = new SignaturePad(canvas);

    // Event listeners
    document.getElementById('document-upload').addEventListener('change', handleFileUpload);
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));
    document.getElementById('save-signature').addEventListener('click', handleSaveSignature);
    document.getElementById('clear-signature').addEventListener('click', () => signaturePad.clear());
    document.getElementById('download-doc').addEventListener('click', handleDownload);
    document.getElementById('add-date-time').addEventListener('click', addDateTime);
    document.getElementById('add-stamp').addEventListener('click', addStamp);
    document.getElementById('add-text').addEventListener('click', addText);

    // Initialize signature pad with proper size
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    autoLoadDocument();
});

function resizeCanvas() {
    const canvas = document.getElementById('signature-pad');
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.classList.remove('hidden');

        try {
            const arrayBuffer = await file.arrayBuffer();
            pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            currentPage = 1;
            await renderPage(currentPage);
            updatePageControls();
        } catch (error) {
            console.error('Error loading PDF:', error);
            alert('Error loading PDF. Please try again.');
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    }
}

async function renderPage(pageNumber) {
    if (!pdfDoc) return;

    try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: currentScale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const pdfViewer = document.getElementById('pdf-viewer');
        pdfViewer.innerHTML = '';
        pdfViewer.appendChild(canvas);

        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

    } catch (error) {
        console.error('Error rendering page:', error);
        alert('Error rendering page. Please try again.');
    }
}

function changePage(delta) {
    if (!pdfDoc) return;

    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= pdfDoc.numPages) {
        currentPage = newPage;
        renderPage(currentPage);
        updatePageControls();
    }
}

function updatePageControls() {
    const pageNum = document.getElementById('page-num');
    pageNum.textContent = `Page ${currentPage} of ${pdfDoc.numPages}`;
}

class SignaturePad {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isDrawing = false;
        this.points = [];

        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.setupListeners();
    }

    setupListeners() {
        this.canvas.addEventListener('pointerdown', this.startDrawing.bind(this));
        this.canvas.addEventListener('pointermove', this.draw.bind(this));
        this.canvas.addEventListener('pointerup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('pointerout', this.stopDrawing.bind(this));
    }

    startDrawing(e) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.points = [[x, y]];
    }

    draw(e) {
        if (!this.isDrawing) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.points.push([x, y]);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
    }

    stopDrawing() {
        this.isDrawing = false;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.points = [];
    }

    isEmpty() {
        return this.points.length === 0;
    }

    toDataURL() {
        return this.canvas.toDataURL('image/png');
    }
}

async function handleSaveSignature() {
    if (signaturePad.isEmpty()) {
        alert('Please draw a signature first');
        return;
    }

    // Create signature image
    const signatureImage = document.createElement('img');
    signatureImage.src = signaturePad.toDataURL();
    signatureImage.className = 'signature-preview';
    signatureImage.style.maxWidth = '200px';
    signatureImage.style.position = 'absolute';
    signatureImage.style.left = '50px';
    signatureImage.style.top = '50px';
    signatureImage.style.zIndex = '1000';

    // Remove existing signature if any
    const existingSignature = document.querySelector('.signature-preview');
    if (existingSignature) {
        existingSignature.remove();
    }

    // Add to PDF viewer
    const pdfViewer = document.getElementById('pdf-viewer');
    pdfViewer.appendChild(signatureImage);

    makeDraggable(signatureImage);
}

function makeDraggable(element) {
    let active = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = parseInt(element.style.left) || 0;
    let yOffset = parseInt(element.style.top) || 0;

    element.addEventListener('mousedown', dragStart, false);
    element.addEventListener('touchstart', dragStart, false);
    document.addEventListener('mousemove', drag, false);
    document.addEventListener('touchmove', drag, false);
    document.addEventListener('mouseup', dragEnd, false);
    document.addEventListener('touchend', dragEnd, false);

    function dragStart(e) {
        const pdfViewer = document.getElementById('pdf-viewer');
        const viewerRect = pdfViewer.getBoundingClientRect();

        if (e.type === 'touchstart') {
            initialX = e.touches[0].clientX - viewerRect.left;
            initialY = e.touches[0].clientY - viewerRect.top;
        } else {
            initialX = e.clientX - viewerRect.left;
            initialY = e.clientY - viewerRect.top;
        }

        if (e.target === element) {
            active = true;
            xOffset = parseInt(element.style.left) || 0;
            yOffset = parseInt(element.style.top) || 0;
            
            // Calculate the offset from the mouse position to the element's top-left corner
            initialX = initialX - xOffset;
            initialY = initialY - yOffset;
        }
    }

    function drag(e) {
        if (active) {
            e.preventDefault();

            const pdfViewer = document.getElementById('pdf-viewer');
            const viewerRect = pdfViewer.getBoundingClientRect();

            let mouseX, mouseY;
            if (e.type === 'touchmove') {
                mouseX = e.touches[0].clientX - viewerRect.left;
                mouseY = e.touches[0].clientY - viewerRect.top;
            } else {
                mouseX = e.clientX - viewerRect.left;
                mouseY = e.clientY - viewerRect.top;
            }

            currentX = mouseX - initialX;
            currentY = mouseY - initialY;

            // Constrain movement within PDF viewer bounds
            currentX = Math.min(Math.max(0, currentX), viewerRect.width - element.offsetWidth);
            currentY = Math.min(Math.max(0, currentY), viewerRect.height - element.offsetHeight);

            // Update element position
            element.style.left = `${currentX}px`;
            element.style.top = `${currentY}px`;
            
            // Store the offset for next drag
            xOffset = currentX;
            yOffset = currentY;
        }
    }

    function dragEnd() {
        active = false;
    }
}

function addDateTime() {
    const dateTime = document.getElementById('date-time-picker').value;
    if (!dateTime) {
        alert('Please select a date and time');
        return;
    }

    const dateTimeElement = document.createElement('div');
    dateTimeElement.textContent = new Date(dateTime).toLocaleString();
    dateTimeElement.className = 'date-time-preview';
    dateTimeElement.style.position = 'absolute';
    dateTimeElement.style.left = '50px';
    dateTimeElement.style.top = '100px';
    dateTimeElement.style.backgroundColor = 'white';
    dateTimeElement.style.padding = '5px';
    dateTimeElement.style.border = '1px solid black';
    dateTimeElement.style.borderRadius = '3px';
    dateTimeElement.style.fontSize = '14px';
    dateTimeElement.style.zIndex = '1000';

    const pdfViewer = document.getElementById('pdf-viewer');
    pdfViewer.appendChild(dateTimeElement);

    makeDraggable(dateTimeElement);
}

function addStamp() {
    const stampFile = document.getElementById('stamp-upload').files[0];
    if (!stampFile) {
        alert('Please upload a stamp image');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const stampImage = document.createElement('img');
        stampImage.src = e.target.result;
        stampImage.className = 'stamp-preview';
        stampImage.style.position = 'absolute';
        stampImage.style.left = '50px';
        stampImage.style.top = '150px';
        stampImage.style.maxWidth = '100px';
        stampImage.style.maxHeight = '100px';
        stampImage.style.zIndex = '1000';

        const pdfViewer = document.getElementById('pdf-viewer');
        pdfViewer.appendChild(stampImage);

        makeDraggable(stampImage);
    }
    reader.readAsDataURL(stampFile);
}

function addText() {
    const text = document.getElementById('text-input').value;
    if (!text) {
        alert('Please enter some text');
        return;
    }

    const textElement = document.createElement('div');
    textElement.textContent = text;
    textElement.className = 'text-preview';
    textElement.style.position = 'absolute';
    textElement.style.left = '50px';
    textElement.style.top = '200px';
    textElement.style.backgroundColor = 'white';
    textElement.style.padding = '5px';
    textElement.style.border = '1px solid black';
    textElement.style.borderRadius = '3px';
    textElement.style.fontSize = '14px';
    textElement.style.zIndex = '1000';

    const pdfViewer = document.getElementById('pdf-viewer');
    pdfViewer.appendChild(textElement);

    makeDraggable(textElement);
}

async function handleDownload() {
    if (!pdfDoc) {
        alert('Please upload a PDF first');
        return;
    }

    const elements = document.querySelectorAll('.signature-preview, .date-time-preview, .stamp-preview, .text-preview');
    if (elements.length === 0) {
        alert('Please add at least one element (signature, date & time, stamp, or text) to the document');
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.remove('hidden');

    try {
        const pdfCanvas = document.querySelector('#pdf-viewer canvas');
        const elementsData = Array.from(elements).map(element => ({
            type: element.className,
            x: parseInt(element.style.left) / pdfCanvas.width,
            y: 1 - (parseInt(element.style.top) + element.offsetHeight) / pdfCanvas.height,
            width: element.offsetWidth / pdfCanvas.width,
            height: element.offsetHeight / pdfCanvas.height,
            content: element.tagName.toLowerCase() === 'img' ? element.src : element.textContent
        }));

        // Create new PDF with added elements
        const pdfBytes = await createModifiedPDF(elementsData);
        
        // Download the PDF
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'modified-document.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading PDF:', error);
        alert('Error generating PDF. Please try again.');
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

async function createModifiedPDF(elementsData) {
    const formData = new FormData();
    const pdfFile = document.getElementById('document-upload').files[0];
    const pdfArrayBuffer = await pdfFile.arrayBuffer();
    
    const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
    const pages = pdfDoc.getPages();
    const page = pages[currentPage - 1];

    const { width, height } = page.getSize();

    for (const element of elementsData) {
        if (element.type === 'signature-preview' || element.type === 'stamp-preview') {
            const imageBytes = await fetch(element.content).then(res => res.arrayBuffer());
            const image = await pdfDoc.embedPng(imageBytes);
            page.drawImage(image, {
                x: width * element.x,
                y: height * element.y,
                width: width * element.width,
                height: height * element.height
            });
        } else {
            page.drawText(element.content, {
                x: width * element.x,
                y: height * element.y,
                size: 14,
                color: rgb(0, 0, 0)
            });
        }
    }

    return await pdfDoc.save();
}