import ky from 'ky';

export function createRegulationService() {
    const BASE_URL = 'https://www.federalregister.gov/api/v1/documents.json';

    /**
     * Holt die neuesten Publikationen der Federal Reserve zum Thema "Regulation D"
     * @returns {Promise<Array>} Ein Array der gefundenen Dokumente
     */
    const fetchRecentRegulationD = async () => {
        const searchParams = {
            'conditions[agencies][]': 'federal-reserve-system',
            'conditions[term]': 'Regulation D',
            'order': 'newest',
            'per_page': 5
        };

        try {
            const response = await ky.get(BASE_URL, { searchParams }).json();
            return response.results || [];
        } catch (error) {
            console.error('Fehler beim Abrufen der Federal Register API:', error.message);
            throw error;
        }
    };

    return {
        fetchRecentRegulationD
    };
}