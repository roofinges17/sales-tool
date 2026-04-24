# Sales Rep Onboarding — Roofing Experts Sales Tool

**URL:** https://roofing-experts-sales-tool.pages.dev  
**Support:** Alejandro Perez-Madrid · 786-718-9593 · roofinges@gmail.com

---

## 1. Getting Started

### Login
1. Go to the URL above and click **Sign In**.
2. Enter your email and the temporary password your manager set.
3. On first login you'll be prompted to set a new password — do that now.

> Your account must be created by an Admin before you can log in. If you see "Invalid credentials" contact your manager.

---

## 2. Creating a Customer

Every estimate starts with a customer account.

1. Click **Accounts** in the left sidebar.
2. Click **New Account** (top right).
3. Fill in:
   - **Name** — full name or business name
   - **Email / Phone** — at least one required
   - **Billing Address** — street, city, state, ZIP (used on the PDF and for the property folio lookup)
4. Click **Save**.

The customer is now saved and you can build an estimate from their record or from the Quote Builder directly.

---

## 3. Building an Estimate (6-Step Wizard)

Go to **Quotes → New Estimate** (or click **Build Estimate** from any customer page).

### Step 1 — Department
Select the department handling this job (e.g., *Roofing*). This controls which products and commission plan apply.

### Step 2 — Products

This is where you build the line items.

**Finding products:**
- Use the search bar or the **Roof Type / Extra** filter tabs.
- Roof products (Metal, Tile, Shingle, Flat, Aluminum) are separated from add-ons.

**Adding a roof product:**
- Roof products require a square footage entry before adding to the estimate.
- Click the **sq ft** button next to the product. A number input appears.
- Type the area and press **Add** (or hit Enter).
- If you measured the roof first (see §4), the area pre-fills automatically.

**Adding extras:**
- Non-roof items (gutters, permits, etc.) use the green **+** button — they add with qty 1.
- Adjust quantity in the Estimate Items panel on the right.

**Right sidebar:**
- Shows a live running total as you add items.
- You can change quantity inline — click the qty field and type a new number.
- Remove any item with the **×** button.

### Step 3 — Customer
Search for an existing customer or create one on the spot. Fill in the property address if it differs from their billing address.

### Step 4 — Review
Full line-item summary with editable unit prices (within the min/max range set by admin). Apply a discount if needed:
- **Percentage** or **fixed dollar** discount.
- Price floor is enforced — you can't go below the product's minimum price.

### Step 5 — Financing *(optional)*
If the customer wants to finance, pick a plan here. The monthly payment is calculated and shown on the PDF automatically.

### Step 6 — Generate
Click **Generate Estimate**. The system:
1. Saves the estimate to the database.
2. Creates a shareable customer acceptance link.
3. Downloads a PDF you can print or email.

---

## 4. AI Roof Measurement

Skip manual tape-measure math. The tool uses Google Solar satellite data to estimate roof area.

**How to use:**
1. In Step 2, look at the right sidebar — there's an **AI Roof Measurement** card.
2. Type the property address and click **Measure**.
3. Wait ~5 seconds. The tool returns:
   - Total roof area (sq ft)
   - Sloped area and flat area (if separate sections exist)
   - Average pitch and segment count
4. After measuring, the **sq ft** buttons on each roof product pre-fill with the correct area (sloped vs. flat matched automatically).

You can also access the standalone measurement tool at **/measure** — useful for quick estimates without building a full quote.

> Satellite data covers most South Florida properties. If the address returns no data, enter sq ft manually.

---

## 5. Sending & Tracking an Estimate

### Sending to the customer
From the estimate detail page:
1. Click **Download PDF** to get the estimate PDF — send it by email/text outside the app.
2. Click **Copy Accept Link** to get the customer's acceptance URL — they can review and sign from their phone, no login needed.
3. Click **Mark as Sent** to update the estimate status and log it in GHL.

### Tracking status
Estimates cycle through: **Draft → Sent → Accepted → Converted to Contract**

- The **Quotes** list shows all estimates and their current status.
- Once the customer accepts via the link, the status updates automatically.
- Click **Convert to Contract** on an accepted estimate to move it to the Sales pipeline.

---

## 6. The Pipeline

After converting to a contract, the job moves to the **Pipeline** board (Kanban view).

- Each column is a workflow stage your manager configured (e.g., Permitting → In Progress → Final Inspection → Closed).
- Drag cards between columns as the job progresses.
- Each move is logged with a timestamp so managers can see the full history.

---

## 7. Commissions

Go to **Commissions** in the sidebar to see what you've earned.

- Each closed contract generates a commission entry based on the plan assigned to your lead source.
- Status tracks: **Pending → Approved → Paid**.
- You can't edit commission entries — your manager reviews and approves.

> Commission is calculated from the margin (your sale price minus product cost). Pricing below the minimum price floor protects your commission floor.

---

## 8. Quick Reference

| I want to… | Where to go |
|---|---|
| Add a new customer | Accounts → New Account |
| Build an estimate | Quotes → New Estimate |
| Measure a roof instantly | /measure or Step 2 sidebar |
| See all my estimates | Quotes |
| Check job status | Pipeline |
| See my earnings | Commissions |
| Get the PDF for a quote | Quote detail → Download PDF |
| Send the accept link | Quote detail → Copy Accept Link |

---

## 9. Common Questions

**Q: The satellite measurement is wrong — the roof area looks off.**  
A: Satellite accuracy varies by zoom/imagery age. Use it as a starting point, adjust sq ft manually in the input field before adding to estimate.

**Q: I can't find a product I need.**  
A: Products are admin-configured. Ask your manager to add it under Settings → Products.

**Q: A customer accepted the estimate but status still shows "Sent".**  
A: Refresh the page. The webhook updates status near-instantly but a manual refresh may be needed.

**Q: I accidentally added the wrong customer to an estimate.**  
A: Edit the estimate (pencil icon on the estimate detail) and change the customer before it's accepted.

**Q: My commission isn't showing up.**  
A: Commissions appear after the contract is marked active and the commission entry is generated. If missing after 24h, contact your manager.
