(function () {
    const C = {
        purple: [91, 33, 182],
        accent: [124, 58, 237],
        ink: [30, 41, 59],
        muted: [100, 116, 139],
        line: [203, 213, 225],
        paper: [248, 247, 255]
    };

    function text(doc, value, x, y, options) {
        doc.text(String(value ?? ''), x, y, options || {});
    }

    function card(doc, x, y, width, height) {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...C.line);
        doc.setLineWidth(0.45);
        doc.roundedRect(x, y, width, height, 2.5, 2.5, 'FD');
    }

    function footer(doc, pageNumber, pageCount) {
        const width = doc.internal.pageSize.getWidth();
        const height = doc.internal.pageSize.getHeight();
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.25);
        doc.line(12, height - 10, width - 12, height - 10);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...C.muted);
        text(doc, "Li'l Champs Abacus Academy, Ambernath", 12, height - 5.5);
        text(doc, `Page ${pageNumber} of ${pageCount}`, width - 12, height - 5.5, { align: 'right' });
    }

    function drawOverview(doc, studentName, rows) {
        const width = doc.internal.pageSize.getWidth();
        doc.setFillColor(...C.paper);
        doc.rect(0, 0, width, 210, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(23);
        doc.setTextColor(...C.purple);
        text(doc, "Li'l Champs Abacus Academy", 12, 17);
        doc.setFontSize(12);
        doc.setTextColor(71, 85, 105);
        text(doc, 'Formula Practice Report', 12, 25);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...C.muted);
        text(doc, `Generated: ${new Date().toLocaleDateString('en-IN')}`, width - 12, 16, { align: 'right' });
        text(doc, 'Student', width - 12, 22, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...C.accent);
        text(doc, studentName, width - 12, 29, { align: 'right' });
        doc.setDrawColor(...C.accent);
        doc.setLineWidth(0.8);
        doc.line(12, 34, width - 12, 34);

        card(doc, 12, 40, width - 24, 25);
        const stats = [
            ['PRACTICE SESSIONS', String(rows.length)],
            ['DATE RANGE', document.getElementById('pdfDateRange').innerText],
            ['LAST ACTIVE', rows.length ? getRawDate(rows[0].created_at) : '-']
        ];
        const statWidth = (width - 24) / 3;
        stats.forEach(([label, value], index) => {
            const centre = 12 + statWidth * index + statWidth / 2;
            if (index) {
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.5);
                doc.line(12 + statWidth * index, 45, 12 + statWidth * index, 60);
            }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...C.muted);
            text(doc, label, centre, 48, { align: 'center' });
            doc.setFontSize(index === 0 ? 20 : 11);
            doc.setTextColor(...(index === 1 ? [51, 65, 85] : C.accent));
            text(doc, value, centre, 58, { align: 'center' });
        });

        const leftX = 12, topY = 71, leftW = 166, rightX = 184;
        const rightW = width - rightX - 12, cardHeight = 114;
        card(doc, leftX, topY, leftW, cardHeight);
        card(doc, rightX, topY, rightW, cardHeight);

        const monthValue = document.getElementById('monthPicker').value;
        const [year, monthNumber] = monthValue.split('-').map(Number);
        const monthName = new Date(year, monthNumber - 1, 1)
            .toLocaleString('en-IN', { month: 'long', year: 'numeric' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...C.ink);
        text(doc, `Consistency - ${monthName}`, leftX + 6, topY + 9);

        const practiceDates = new Set(globalReports.map(row => getDateOnly(row.created_at)));
        const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        const gridX = leftX + 6, gridY = topY + 19, cellW = 21.8, cellH = 13;
        doc.setFontSize(7.5);
        doc.setTextColor(...C.muted);
        weekdays.forEach((day, index) => text(doc, day, gridX + index * cellW + cellW / 2, gridY, { align: 'center' }));

        const firstDay = new Date(year, monthNumber - 1, 1).getDay();
        const daysInMonth = new Date(year, monthNumber, 0).getDate();
        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        for (let day = 1; day <= daysInMonth; day++) {
            const position = firstDay + day - 1;
            const column = position % 7;
            const row = Math.floor(position / 7);
            const x = gridX + column * cellW;
            const y = gridY + 4 + row * cellH;
            const dateKey = `${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const practiced = practiceDates.has(dateKey);
            if (practiced) {
                doc.setFillColor(220, 252, 231); doc.setDrawColor(134, 239, 172); doc.setTextColor(21, 128, 61);
            } else if (dateKey < todayKey) {
                doc.setFillColor(254, 242, 242); doc.setDrawColor(254, 202, 202); doc.setTextColor(239, 68, 68);
            } else {
                doc.setFillColor(255, 255, 255); doc.setDrawColor(226, 232, 240); doc.setTextColor(148, 163, 184);
            }
            doc.setLineWidth(0.25);
            doc.roundedRect(x, y, cellW - 1, cellH - 1, 1, 1, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            text(doc, `${day}${practiced ? ' *' : ''}`, x + (cellW - 1) / 2, y + 7.5, { align: 'center' });
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        text(doc, '* Practiced', leftX + 6, topY + cardHeight - 5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...C.ink);
        text(doc, 'Practice Distribution', rightX + 6, topY + 9);
        const counts = { 'Small Friend': 0, 'Big Friend': 0, 'Mix Friend': 0 };
        rows.forEach(row => counts[classifyFormula(row.formula)]++);
        const items = [
            ['Small', counts['Small Friend'], [251, 191, 36]],
            ['Big', counts['Big Friend'], [59, 130, 246]],
            ['Mix', counts['Mix Friend'], [139, 92, 246]]
        ];
        const maxCount = Math.max(...items.map(item => item[1]), 1);
        const chartBottom = topY + 91, chartHeight = 64;
        doc.setDrawColor(...C.line);
        doc.line(rightX + 13, chartBottom, rightX + rightW - 7, chartBottom);
        items.forEach(([label, count, colour], index) => {
            const barX = rightX + 23 + index * 32;
            const barHeight = count ? Math.max(4, count / maxCount * chartHeight) : 0;
            doc.setFillColor(...colour);
            if (barHeight) doc.roundedRect(barX, chartBottom - barHeight, 17, barHeight, 1.5, 1.5, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...C.ink);
            text(doc, count, barX + 8.5, chartBottom - barHeight - 2.5, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(71, 85, 105);
            text(doc, label, barX + 8.5, chartBottom + 5, { align: 'center' });
        });
    }

    window.downloadPDF = function () {
        if (document.getElementById('resultsArea').classList.contains('hidden')) {
            alert("Please select a student and click 'Show Report' first.");
            return;
        }

        const studentName = document.getElementById('studentDropdown').value || 'Student';
        const rows = currentReportRows || [];
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        drawOverview(doc, studentName, rows);

        doc.addPage('a4', 'landscape');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(...C.ink);
        text(doc, 'Practice Sessions', 12, 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...C.muted);
        text(doc, 'Each session contains 3 rounds x 10 sums', 12, 22);

        const body = rows.length ? rows.map(row => {
            const roundSummary = row.isThirtySumSession
                ? row.rounds.map(r => `R${r.round_number || '?'}: ${Number(r.score) || 0}/10`).join('   ')
                : 'Earlier 10-sum record';
            const status = row.isThirtySumSession && !row.completed ? `\nIncomplete: ${row.rounds.length}/3 rounds` : '';
            return [
                getRawDate(row.created_at), `${row.formula || '-'}${status}`, classifyFormula(row.formula),
                `${row.score ?? '-'}/${row.questions || 10}\n${roundSummary}`, row.time || '-'
            ];
        }) : [['-', 'No formula practice records found for this range.', '-', '-', '-']];

        doc.autoTable({
            startY: 27,
            margin: { left: 12, right: 12, bottom: 15 },
            head: [['DATE', 'FORMULA', 'TYPE', 'SCORE', 'TIME']],
            body,
            theme: 'grid',
            rowPageBreak: 'avoid',
            showHead: 'everyPage',
            styles: {
                font: 'helvetica', fontSize: 9, textColor: [51, 65, 85],
                cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
                lineColor: C.line, lineWidth: 0.25, valign: 'middle'
            },
            headStyles: { fillColor: C.purple, textColor: [255, 255, 255], fontStyle: 'bold', lineColor: C.purple },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 36, fontStyle: 'bold' }, 1: { cellWidth: 58 }, 2: { cellWidth: 46 },
                3: { cellWidth: 90, textColor: C.accent, fontStyle: 'bold' }, 4: { cellWidth: 38, fontStyle: 'bold' }
            }
        });

        const pageCount = doc.getNumberOfPages();
        for (let page = 1; page <= pageCount; page++) {
            doc.setPage(page);
            footer(doc, page, pageCount);
        }
        const safeName = studentName.replace(/[^a-z0-9 _-]/gi, '').trim() || 'Student';
        doc.save(`${safeName}_FormulaReport.pdf`);
    };
})();
