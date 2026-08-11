import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LedgerData, LedgerDetailItem } from '../../models/ledger.model';
import { indianFormat } from '../../services/indian-number-format.util';

const MIDDLE_GAP_PX = 5;
const FOOTER_BUFFER_PX = 40;
const RESIZE_DEBOUNCE_MS = 200;

@Component({
  selector: 'app-ledger-report',
  standalone: true,
  templateUrl: './ledger-report.component.html',
  styleUrls: ['./ledger-report.component.css'],
  // Pages/rows are built via document.createElement (not Angular templates) so the
  // pagination algorithm can measure real rendered heights before deciding page breaks.
  // Scoped/emulated encapsulation only tags elements compiled from the template, so it
  // wouldn't apply to these dynamically-created nodes - styles need to be global instead.
  encapsulation: ViewEncapsulation.None
})
export class LedgerReportComponent implements AfterViewInit, OnDestroy {
  @ViewChild('pagesContainer', { static: true }) pagesContainer!: ElementRef<HTMLDivElement>;

  errorMessage = '';

  private jsonData!: LedgerData;
  private pageCount = 1;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  // The host page (ledger-preview.component.ts) resizes THIS iframe's own width/height to
  // its true full size right before printing, then back to '' right after - and because
  // that's a genuine size change to the iframe's own box, it fires a 'resize' event in here
  // too, indistinguishable from a real user resize/zoom. Without this flag, that
  // self-inflicted resize would schedule a second, redundant generateReport() rebuild
  // ~200ms after onBeforePrint's own (correct, synchronous) rebuild already ran - racing
  // against the host's own fitFrame() call, which measures this document's size *before*
  // that late rebuild fires.
  private isPrinting = false;
  private readonly onResize = (): void => {
    if (this.isPrinting) {
      return;
    }
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.generateReport();
      this.applyResponsiveScale();
    }, RESIZE_DEBOUNCE_MS);
  };
  private readonly onBeforePrint = (): void => {
    this.isPrinting = true;
    this.generateReport();
  };
  // NOT cleared synchronously on afterprint - onAfterPrint's iframe.style.width/height
  // reset (on the host page) fires its own native 'resize' event on this window, but that
  // event arrives asynchronously (a task or more later), after this handler's own
  // synchronous code already finished. Clearing the flag here immediately would very likely
  // already be false again by the time that trailing resize event shows up, defeating the
  // guard above entirely (confirmed empirically against the same pattern in invoice.html -
  // the naive "clear synchronously on afterprint" version still let the redundant rebuild
  // through every time). Outlasting the resize debounce window comfortably covers it instead.
  private readonly onAfterPrint = (): void => {
    setTimeout(() => {
      this.isPrinting = false;
    }, RESIZE_DEBOUNCE_MS + 100);
  };

  constructor(private route: ActivatedRoute) {}

  ngAfterViewInit(): void {
    this.generateReport();
    this.applyResponsiveScale();
    // Pagination is otherwise a one-time calculation done at load. If the user zooms
    // in/out *after* the report is already rendered, text can reflow slightly differently
    // at the new zoom (the same subpixel rounding issue fixed elsewhere, just triggered
    // live instead of at load), making the last row on a page grow past what was
    // originally budgeted for - and since the footer sits at a fixed position, that
    // growth pushes the row into/past it. Zoom changes fire a resize event (they change
    // the effective CSS pixel viewport), so re-running generateReport() there re-paginates
    // against the new zoom's real measurements. applyResponsiveScale() runs after so a
    // narrow window still just shrinks to fit rather than scrolling.
    window.addEventListener('resize', this.onResize);
    // Printing is a separate rendering pass that generally ignores whatever on-screen zoom
    // is active - so a page grouping calibrated for the current screen zoom doesn't
    // necessarily match how many rows actually fit once the browser switches to print
    // layout. By the time 'beforeprint' fires, the browser has already applied print-
    // specific layout, so regenerating here calibrates pagination against what will
    // actually be printed, not whatever the screen happened to be showing beforehand.
    window.addEventListener('beforeprint', this.onBeforePrint);
    window.addEventListener('afterprint', this.onAfterPrint);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('beforeprint', this.onBeforePrint);
    window.removeEventListener('afterprint', this.onAfterPrint);
    clearTimeout(this.resizeTimer);
  }

  private base64ToUtf8(base64: string): string {
    const binaryString = atob(base64);
    const bytes = new Uint8Array([...binaryString].map((char) => char.charCodeAt(0)));
    return new TextDecoder().decode(bytes);
  }

  // Renders a throwaway footer off in the body purely to measure its real height, since
  // it's the same content/font on every page regardless of page number - one measurement
  // covers the whole document. Previously this budget was a hardcoded 80px guess, which
  // reserved far more room than the footer (a single line of date/time + page number)
  // actually needs, leaving a large unused gap before the footer instead of letting data
  // fill the page.
  private measureFooterHeight(pageNumber: number): number {
    const probe = document.createElement('div');
    this.generateFooterSection(probe, pageNumber);
    document.body.appendChild(probe);
    // generateFooterSection's own element is absolutely positioned, so it doesn't
    // contribute to a non-positioned wrapper's height - measure it directly instead.
    const height = (probe.firstElementChild as HTMLElement).getBoundingClientRect().height;
    document.body.removeChild(probe);
    return height;
  }

  // Measures the header's rendered height. This used to poll across animation frames
  // waiting for a non-zero height, on the assumption that layout might not be ready the
  // instant an element is appended - but getBoundingClientRect() forces the browser to
  // flush any pending layout synchronously before returning, so the value is always
  // accurate immediately, no waiting needed. That async polling was the actual cause of a
  // real bug: generateReport() had to be async to use it, and the browser does not wait
  // for an async 'beforeprint' handler to finish before capturing print output - so
  // printing could snapshot the page after this method's synchronous reset (which clears
  // the container) but before the rebuild finished, printing a blank page. Making this
  // synchronous lets the whole generation run start-to-finish in one go, safe to call
  // from 'beforeprint'.
  private measureHeaderHeight(page: HTMLDivElement): number {
    const headerSection = page.querySelector('.FloatNum');
    // getBoundingClientRect() returns sub-pixel float values that reflect true CSS layout
    // geometry - unlike offsetHeight, which rounds to whole device pixels and can round
    // differently at different browser zoom levels, throwing off pagination.
    return headerSection ? headerSection.getBoundingClientRect().height : 0;
  }

  private generateReport(): void {
    // Defensive reset: this runs again on every resize/zoom change (see ngAfterViewInit),
    // reusing the same container - without clearing it first, old .page elements would
    // stay in the DOM and the new run's pages would just pile up after them.
    this.pagesContainer.nativeElement.innerHTML = '';
    this.pageCount = 1;

    const message = this.route.snapshot.queryParamMap.get('message');
    if (!message) {
      this.errorMessage = 'No message found in the URL parameters.';
      console.error(this.errorMessage);
      return;
    }

    try {
      const storedValue = localStorage.getItem('ledgerData');
      this.jsonData = JSON.parse(this.base64ToUtf8(storedValue ?? message));

      const page = this.createNewPage();
      const localPageNumber = this.pageCount;

      this.addSectionToPage(page, (el) => this.generateHeaderSection(el, this.jsonData));
      const headerAddHeight = this.measureHeaderHeight(page);

      const footerSectionHeight = this.measureFooterHeight(localPageNumber) + FOOTER_BUFFER_PX;
      const usedHeight = headerAddHeight + footerSectionHeight;
      // Page height was previously a hardcoded 1100px constant, but every other measurement
      // here (header/footer/row heights) is a live getBoundingClientRect() reading, which
      // reports the actual visually-rendered size at whatever zoom is currently active. At
      // 100% zoom those happen to line up, so this went unnoticed - but at any other zoom,
      // the real rendered page height shrinks or grows while this constant stayed fixed,
      // over- or under-allocating the row budget by the difference and causing rows to
      // overflow into (or leave a huge gap before) the footer. Measuring the actual page
      // keeps every quantity in the same, currently-true unit.
      const pageHeightInPx = page.getBoundingClientRect().height;
      const maxHeight = pageHeightInPx - usedHeight;

      this.generateBodySectionWithPagination(page, this.jsonData, this.jsonData.ledger_details, maxHeight);
      this.addSectionToPage(page, (el) => this.generateFooterSection(el, localPageNumber));
    } catch (error) {
      this.errorMessage = 'Error decoding or parsing JSON.';
      console.error('Error decoding or parsing JSON:', error);
    }
  }

  private createNewPage(): HTMLDivElement {
    const pageFrame = document.createElement('div');
    pageFrame.className = 'page-frame';

    const newPage = document.createElement('div');
    newPage.className = 'page';
    newPage.style.position = 'relative';
    newPage.style.pageBreakBefore = 'always';
    newPage.style.width = '21cm';
    newPage.style.height = '1100px';
    // The paper this page is meant for, stated the same way every other print layout in
    // public/print/ states it. It is deliberately NOT the same thing as the height just above:
    // 1100px is this report's on-screen page box, whereas A4 is what it prints on (see the
    // @page rule in this component's CSS). Anything measuring the report from outside has to
    // read the paper size rather than infer it from the screen box - the preview wrapper needs
    // it for the printing document's own @page rule and for the PDF export's page size, and it
    // previously had 21cm x 29.7cm hardcoded on its side instead, which is the sort of
    // duplicate that quietly goes stale. See preview-page.util.ts.
    newPage.dataset['pageWCm'] = '21';
    newPage.dataset['pageHCm'] = '29.7';

    pageFrame.appendChild(newPage);
    this.pagesContainer.nativeElement.appendChild(pageFrame);
    return newPage;
  }

  // Shrinks each page to fit the available screen width, like how a PDF viewer auto-fits
  // a document to a phone screen - purely a visual scale (CSS transform), so the actual
  // data/pagination decided by generateReport() is completely untouched. Never scales up
  // past 100%, only down, so it never affects wide/desktop screens where the page already fits.
  private applyResponsiveScale(): void {
    const frames = this.pagesContainer.nativeElement.querySelectorAll<HTMLDivElement>('.page-frame');
    frames.forEach((frame) => {
      const page = frame.querySelector<HTMLDivElement>('.page');
      if (!page) {
        return;
      }
      // Reset before measuring, so repeated calls always measure the page's true natural
      // size rather than compounding an already-applied scale.
      page.style.transform = 'none';
      frame.style.width = '';
      frame.style.height = '';

      const naturalWidth = page.getBoundingClientRect().width;
      const naturalHeight = page.getBoundingClientRect().height;
      // A small safety margin (rather than the exact measured width) absorbs the vertical
      // scrollbar that a tall multi-page document needs - its width isn't always reflected
      // yet in clientWidth at the exact moment this measures, which could otherwise leave a
      // few px of horizontal overflow.
      const availableWidth = document.documentElement.clientWidth - 20;
      const scale = Math.min(1, availableWidth / naturalWidth);

      page.style.transform = `scale(${scale})`;
      page.style.transformOrigin = 'top left';
      // A CSS transform doesn't change the element's own layout box, so without this the
      // frame would still occupy the page's full, unscaled width/height.
      frame.style.width = `${naturalWidth * scale}px`;
      frame.style.height = `${naturalHeight * scale}px`;
    });
  }

  private addSectionToPage(page: HTMLDivElement, sectionFn: (el: HTMLDivElement) => void): number {
    const tempSection = document.createElement('div');
    sectionFn(tempSection);
    page.appendChild(tempSection);
    return tempSection.getBoundingClientRect().height;
  }

  private generateBodySectionWithPagination(
    initialPage: HTMLDivElement,
    jsonData: LedgerData,
    items: LedgerDetailItem[],
    maxHeight: number
  ): void {
    let currentPage = initialPage;
    let tbody!: HTMLTableSectionElement;
    let currentHeight = 0;
    let adjustedMaxHeight = 0;

    const setupBodySection = (): void => {
      const bodySection = document.createElement('div');
      bodySection.className = 'body';
      bodySection.style.border = jsonData.config.main_table_border === false ? 'hidden' : '1px solid black';
      bodySection.style.margin = '0 20px';
      // No max-height here on purpose: the row-counting logic below is what actually
      // decides how many rows fit on this page (comparing measured heights against
      // adjustedMaxHeight). A CSS max-height would cap this box's border at our
      // *estimated* budget - if that estimate is ever even slightly off from how a given
      // environment actually renders (font metrics, sub-pixel rounding), the bordered box
      // gets capped there while the actual rows keep extending past it, making the border
      // look like it cuts through the middle of the table instead of wrapping around all
      // of it. Letting the box size itself to its real content keeps the border aligned
      // with exactly the rows that are actually in it, regardless of estimate drift.

      const bodyTable = document.createElement('table');
      bodyTable.className = 'body-table';
      bodyTable.style.border = 'hidden';
      bodyTable.style.width = '100%';
      bodyTable.style.borderCollapse = 'collapse';
      // Without this, the browser's default "auto" table layout redistributes column
      // widths based on all rows' content collectively - so a long narration added
      // several rows later could retroactively shift column widths, making the per-row
      // height measurements taken during incremental construction (below) stale by the
      // time the full table exists. Fixed layout locks column widths to the header's
      // percentages from the first row.
      bodyTable.style.tableLayout = 'fixed';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');

      // These 7 always-visible columns sum to 95%, plus Journal ID's 5% (shown only when
      // show_journal_id is on) makes exactly 100%. They used to sum to 101% even without
      // Journal ID - harmless under the browser's default table-layout: auto (which treats
      // these as hints and redistributes), but table-layout: fixed (needed elsewhere to
      // keep row-height measurements stable) honors them strictly, so that 1% overflow was
      // clipping the right edge of the last column.
      const headers: { name: string; width: string; show?: boolean }[] = [
        { name: 'Date', width: '13%' },
        { name: 'Journal ID', width: '5%', show: jsonData.config.show_journal_id },
        // "By/To" as a single unbroken token (no space for the browser to wrap at) is wider
        // than this column at any real font size, so it overflowed into the "Type" header
        // next to it. The <br> forces it onto two lines instead of relying on the browser to
        // find a break point in "By/To" (data rows only ever contain the short "By"/"To" on
        // its own, so they were never affected).
        { name: 'By/<br>To', width: '3%' },
        { name: 'Type', width: '5%' },
        { name: 'Account Name', width: '39%' },
        { name: 'Debit', width: '10%' },
        { name: 'Credit', width: '10%' },
        { name: 'Balance', width: '15%' }
      ];

      headers.forEach((header) => {
        if (header.show === undefined || header.show) {
          const th = document.createElement('th');
          th.innerHTML = header.name;
          if (jsonData.config.main_table_border === false) {
            th.style.borderTop = 'hidden';
            th.style.borderLeft = 'hidden';
            th.style.borderRight = 'hidden';
            th.style.borderBottom = '1px solid black';
          } else {
            th.style.border = '1px solid black';
          }
          th.style.textAlign = 'center';
          th.style.width = header.width;
          headerRow.appendChild(th);
        }
      });

      thead.appendChild(headerRow);
      bodyTable.appendChild(thead);

      tbody = document.createElement('tbody');
      bodyTable.appendChild(tbody);
      bodySection.appendChild(bodyTable);
      currentPage.appendChild(bodySection);

      const headerHeight = thead.getBoundingClientRect().height;
      adjustedMaxHeight = maxHeight - headerHeight - MIDDLE_GAP_PX;
    };

    const createNewPageWithHeaderFooter = (): void => {
      currentPage = this.createNewPage();
      this.pageCount++;
      this.addSectionToPage(currentPage, (el) => this.generateHeaderSection(el, jsonData));
      this.addSectionToPage(currentPage, (el) => this.generateFooterSection(el, this.pageCount));
      setupBodySection();
    };

    const generateByToAccountNameContent = (item: LedgerDetailItem): string | undefined => {
      const accountNames = item.det_ac_name ? item.det_ac_name.split('\n') : [];
      const amounts = item.det_amount ? item.det_amount.split('\n') : [];
      let rowContent: string | undefined;

      if (item.view_order == 1) {
        rowContent = item.by_to_account_name + '<br>';
        for (let j = 0; j < accountNames.length; j++) {
          rowContent += `
            <div style="display: flex; justify-content: space-between; margin-left: 20px;">
              <span>${accountNames[j] || '-'}</span>
              <span>${amounts[j] || '-'}</span>
            </div>`;
        }
        if (item.narration) {
          rowContent += `<div style="font-style: italic; font-size: 12px;">${item.narration}</div>`;
        }
      } else if (item.view_order == 0) {
        rowContent =
          item.by_to_account_name +
          `<div style="font-style: italic; font-size: 12px;">${item.narration}</div>`;
      }

      return rowContent;
    };

    const addRow = (item: LedgerDetailItem): void => {
      const tableRow = document.createElement('tr');

      const columns: { value: string | undefined | null; textAlign: string }[] = [
        { value: item.journal_date, textAlign: 'center' },
        { value: jsonData.config.show_journal_id ? item.journal_unique_id : null, textAlign: 'center' },
        { value: item.by_to, textAlign: 'center' },
        { value: item.voucher_type, textAlign: 'left' },
        { value: generateByToAccountNameContent(item), textAlign: 'left' },
        { value: indianFormat(item.dr_amount), textAlign: 'right' },
        { value: indianFormat(item.cr_amount), textAlign: 'right' },
        { value: indianFormat(item.balance), textAlign: 'right' }
      ];

      let maxRowHeight = 0;

      columns.forEach((column) => {
        if (column.value !== null && column.value !== undefined) {
          const td = document.createElement('td');
          td.innerHTML = column.value;
          td.style.textAlign = column.textAlign;
          td.style.width = 'auto';
          td.style.border = jsonData.config.main_table_border === false ? 'hidden' : '1px solid black';
          td.style.verticalAlign = 'top';
          tableRow.appendChild(td);

          tbody.appendChild(tableRow);
          const cellHeight = td.getBoundingClientRect().height;
          if (cellHeight > maxRowHeight) {
            maxRowHeight = cellHeight;
          }
          tbody.removeChild(tableRow);
        }
      });

      tbody.appendChild(tableRow);
      currentHeight += maxRowHeight;

      if (currentHeight > adjustedMaxHeight) {
        tbody.removeChild(tableRow);
        createNewPageWithHeaderFooter();
        tbody.appendChild(tableRow);
        currentHeight = maxRowHeight;
      }
    };

    setupBodySection();
    items.forEach((item) => addRow(item));
  }

  private generateHeaderSection(page: HTMLDivElement, data: LedgerData): void {
    const dfloatnum = document.createElement('div');
    dfloatnum.id = 'Float_num';
    dfloatnum.className = 'FloatNum';
    dfloatnum.style.top = '0px';

    const dfloatleft = document.createElement('div');
    dfloatleft.className = 'FloatLeft';

    const floatLefth5 = document.createElement('h5');
    floatLefth5.style.top = '0px';

    const { be_name, be_addline1, be_addline2, be_state, be_pin, be_phone, be_gstin } = data.company_details;
    const nameBlock = `<b><div class="beName">${be_name}</div></b><br>${be_addline1} ${be_addline2} ${be_state} ${be_pin}`;

    if (be_phone !== '' && be_gstin === '') {
      floatLefth5.innerHTML = `${nameBlock}<br>Phone Number: ${be_phone}`;
    } else if (be_phone === '' && be_gstin !== '') {
      floatLefth5.innerHTML = `${nameBlock}<br><b>GSTIN: ${be_gstin}</b>`;
    } else if (be_phone !== '' && be_gstin !== '') {
      floatLefth5.innerHTML = `${nameBlock}<br>Phone Number: ${be_phone}<br><b>GSTIN: ${be_gstin}</b>`;
    } else {
      floatLefth5.innerHTML = nameBlock;
    }
    dfloatleft.appendChild(floatLefth5);

    const dfloatright = document.createElement('div');
    dfloatright.className = 'FloatRight';

    const floatrightp = document.createElement('p');
    floatrightp.className = 'floatrightp';
    floatrightp.innerHTML = `Account Ledger<br>From: ${data.other.from_date} to ${data.other.to_date}`;
    floatrightp.style.marginTop = '-60px';
    floatrightp.style.textAlign = 'right';
    dfloatright.appendChild(floatrightp);

    const hrline = document.createElement('hr');
    hrline.style.marginTop = '18px';
    hrline.style.border = '1px solid';
    hrline.style.width = '95%';

    const headingName = document.createElement('div');
    headingName.className = 'Hname';

    const hName = document.createElement('h4');
    hName.style.textAlign = 'center';
    hName.style.fontSize = '17px';
    hName.style.fontWeight = 'bold';
    hName.innerHTML = `Account: ${data.accounts.account_name}`;
    headingName.appendChild(hName);

    dfloatnum.appendChild(dfloatleft);
    dfloatnum.appendChild(dfloatright);
    dfloatnum.appendChild(hrline);
    dfloatnum.appendChild(headingName);

    page.appendChild(dfloatnum);
  }

  private generateFooterSection(page: HTMLDivElement, pageNumber: number): void {
    const footerSection = document.createElement('div');
    footerSection.style.position = 'absolute';
    footerSection.style.bottom = '0';
    footerSection.style.left = '0';
    footerSection.style.width = '97%';
    footerSection.style.display = 'flex';
    footerSection.style.justifyContent = 'space-between';
    footerSection.style.alignItems = 'center';
    footerSection.style.backgroundColor = '#fff';

    const dateTimeDiv = document.createElement('div');
    dateTimeDiv.style.width = '50%';
    dateTimeDiv.style.textAlign = 'left';

    const dateTimeText = document.createElement('p');
    dateTimeText.className = 'footer1';
    dateTimeText.id = 'foot1';

    const today = new Date();
    const date = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
    let hours = today.getHours();
    const amOrPm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const minutes = String(today.getMinutes()).padStart(2, '0');
    const seconds = String(today.getSeconds()).padStart(2, '0');
    dateTimeText.innerHTML = `${date} ${hours}:${minutes}:${seconds} ${amOrPm}`;
    dateTimeDiv.appendChild(dateTimeText);

    const pageNumberDiv = document.createElement('div');
    pageNumberDiv.style.width = '50%';
    pageNumberDiv.style.textAlign = 'right';

    const pageText = document.createElement('p');
    pageText.className = 'footer2';
    pageText.innerHTML = `Page No: ${pageNumber}`;
    pageNumberDiv.appendChild(pageText);

    footerSection.appendChild(dateTimeDiv);
    footerSection.appendChild(pageNumberDiv);
    page.appendChild(footerSection);
  }
}
