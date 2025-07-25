/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import * as marked from 'marked';

// Define the system prompt as provided by the user, with minor tweaks for clarity.
const SYSTEM_PROMPT = `Jesteś asystentem dziennikarza ekonomicznego Pulsu Biznesu. Codziennie dostarczasz informacje o najważniejszych z perspektywy dziennikarza gospodarczo-ekonomicznego wydarzeniach, publikacjach, ogłoszeniach jakie będą miały miejsce dzień i dwa dni po wpisaniu tego prompta.

WAŻNE:
- Wiążąca jest dla Ciebie data wpisania promptu.
- Nie podawaj informacji, które pojawiły się przed datą prompta.
- Jeżeli prompt będzie napisany w piątek - rozpocznij wyszukiwanie ważnych informacji, które się rozpoczną w poniedziałek.
- Istotne dla dziennikarza są dni robocze.
- Istotne dla dziennikarza są również rocznice wydarzeń i ciekawostki ekonomiczno-gospodarcze. Ważne debaty, wnioski z forów ekonomicznych
- Każda zaprezentowana przez Ciebie informacja musi mieć pokrycie w faktach i musisz podać link do źródła.
- Używaj wyszukiwarki Google do odpowiedzi, aby informacje były aktualne.

ŹRÓDŁA, KTÓRE WARTO PRZESZUKIWAĆ:
- https://macronext.pl/pl/ - dane makro, predykcje, raporty ekonomiczne i giełdowe.
- https://stooq.pl/n/?s=2&p=4+22&c=0 - depesze Polskiej Agencji Prasowej.
- Przegląd wydarzeń tygodnia (publikowany w poniedziałki): https://stooq.pl/n/?f=1692444&c=0&p=4+22
- Tydzień w Kraju / Tydzień na Rynkach: https://stooq.pl/n/?f=1692443&c=0&p=4+22
- Terminy decyzji banków centralnych: https://www.cbrates.com/meetings.htm
- Porządek obrad Rady Ministrów: https://www.gov.pl/web/premier/2025-porzadki-obrad
- Co się wydarzy w nadchodzącym tygodniu: https://www.bankier.pl/tag/co-sie-wydarzy-w-nadchodzacym-tygodniu

WAŻNE: Nie ograniczaj się do tych źródeł. Traktuj je jako dodatek.

Struktura odpowiedzi (użyj formatowania Markdown):

## Executive summary
Krótko (2-3 zdania) napisz, co na co w raporcie zwrócić szczególną uwagę.

## Co będzie ważne jutro w Polsce

### 10 najważniejszych wydarzeń:
- Wydarzenie 1
- Wydarzenie 2
...

### Najważniejsze konferencje ekonomiczne w Polsce:
- konferencja 1
- konferencja 2
...

### 10 najważniejszych wydarzeń i newsów politycznych w Polsce
- Wydarzenie 1
- Wydarzenie 2
...

## Co będzie ważne jutro w Europie

### 10 najważniejszych wydarzeń w Europie:
- Wydarzenie 1
- Wydarzenie 2
...

### 10 najważniejszych wydarzeń i newsów politycznych w Europie:
- Wydarzenie 1
- Wydarzenie 2
...

## Co będzie ważne jutro na świecie

### Co będzie ważne jutro na świecie pod względem gospodarczym. 10 wydarzeń:
- Wydarzenie 1
- Wydarzenie 2
...

## Giełda w Polsce

## 10 najważniejszych wydarzeń związanych z giełdą w Polsce:
- Wydarzenie 1
- Wydarzenie 2
...

## Giełda na świecie

### 10 najważniejszych najważniejszych wydarzeń związanych z giełdą na świecie:
- Wydarzenie 1
- Wydarzenie 2

### 10 ważnych ciekawostek i dat historycznych:
- Ciekawostka 1
- Ciekawostka 2
...
`;

// DOM Element references
const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
const loader = document.getElementById('loader');
const responseContainer = document.getElementById('response-container');
const sourcesContainer = document.getElementById('sources-container');
const sourcesList = document.getElementById('sources-list');

/**
 * Toggles the visibility of the loader and the state of the button.
 * @param isLoading - Whether the loading state should be active.
 */
function setLoading(isLoading: boolean) {
  loader?.classList.toggle('hidden', !isLoading);
  if (generateButton) generateButton.disabled = isLoading;
}

/**
 * Clears previous results from the UI.
 */
function clearUi() {
    if (responseContainer) responseContainer.innerHTML = '';
    if (sourcesList) sourcesList.innerHTML = '';
    if (sourcesContainer) sourcesContainer.classList.add('hidden');
}

/**
 * Displays the list of sources from grounding chunks.
 * @param chunks - The grounding chunks from the API response.
 */
function displaySources(chunks: any[] | undefined) {
    if (!chunks || chunks.length === 0 || !sourcesList || !sourcesContainer) {
        return;
    }

    sourcesList.innerHTML = ''; // Clear just in case
    // Use a Set to store unique URIs
    const uniqueUris = new Set<string>();
    const uniqueChunks: any[] = [];

    for (const chunk of chunks) {
        const uri = chunk.web?.uri;
        if (uri && !uniqueUris.has(uri)) {
            uniqueUris.add(uri);
            uniqueChunks.push(chunk);
        }
    }

    for (const chunk of uniqueChunks) {
        const uri = chunk.web?.uri;
        const title = chunk.web?.title || uri;
        if (uri) {
            const listItem = document.createElement('li');
            const link = document.createElement('a');
            link.href = uri;
            link.textContent = title;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.setAttribute('data-url', uri);
            listItem.appendChild(link);
            sourcesList.appendChild(listItem);
        }
    }
    sourcesContainer.classList.remove('hidden');
}

/**
 * Main function to generate the report.
 */
async function generateReport() {
  if (!process.env.API_KEY) {
    if (responseContainer) {
      responseContainer.innerHTML = '<p style="color: red; font-weight: bold;">Klucz API nie jest skonfigurowany. Ustaw zmienną środowiskową API_KEY.</p>';
    }
    return;
  }

  setLoading(true);
  clearUi();

  let fullText = '';
  let groundingChunks: any[] | undefined;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const responseStream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: "Przygotuj raport na dziś.",
        config: {
            systemInstruction: SYSTEM_PROMPT,
            tools: [{googleSearch: {}}],
        },
    });

    if (responseContainer) responseContainer.innerHTML = '';
    
    // The cursor HTML element
    const cursor = '<span class="cursor"></span>';
    
    for await (const chunk of responseStream) {
        if (chunk.text) {
            fullText += chunk.text;
        }

        if (responseContainer) {
            responseContainer.innerHTML = await marked.parse(fullText) + cursor;
            // Scroll to the bottom to keep the cursor in view
            responseContainer.scrollTop = responseContainer.scrollHeight;
        }
        
        // Accumulate grounding chunks without creating duplicates
        const currentChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (currentChunks) {
            if (!groundingChunks) {
                groundingChunks = [];
            }
            groundingChunks.push(...currentChunks);
        }
    }
    
    // Final render without the cursor
    if (responseContainer) {
        responseContainer.innerHTML = await marked.parse(fullText);
    }
    
    displaySources(groundingChunks);

  } catch (error) {
    console.error('API Error:', error);
    if (responseContainer) {
        responseContainer.innerHTML = `<p style="color: red; font-weight: bold;">Wystąpił błąd podczas generowania raportu. Sprawdź konsolę, aby uzyskać więcej informacji.</p>`;
    }
  } finally {
    setLoading(false);
  }
}


/**
 * Initializes the application.
 */
function main() {
    if (generateButton) {
        generateButton.addEventListener('click', generateReport);
    } else {
        console.error("Could not find the generate button on the page.");
    }
}

main();