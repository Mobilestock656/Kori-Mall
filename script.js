const { createApp } = Vue;

createApp({
    data() {
        return {
            // ใส่ URL Web App ของคุณเรียบร้อยแล้ว
            apiUrl: 'https://script.google.com/macros/s/AKfycbwjBeyslBymi8TfeLVcxX8B27rmnU8U74Hkxnl-R0BpP-77YRIoOZ1cjvvJ6Z4gB5e1Fw/exec', 
            
            products: [], 
            loading: true, 
            selectedCategory: '', 
            selectedBrand: '',
            selectedProduct: null,
            activeImage: '',
            
            cart: [], 
            isCartOpen: false, 
            isCheckingOut: false,
            customer: { name: '', phone: '', address: '' },
            slipBase64: '',
            
            isStatusOpen: false, 
            searchPhone: '',
            orderStatuses: [], 
            printData: null
        }
    },
    computed: {
        // ดึงชื่อหมวดหมู่และรองรับ 1 สินค้ามีหลายหมวด (คั่นด้วยลูกน้ำ)
        uniqueCategories() {
            let allCats = [];
            this.products.forEach(p => {
                if (p['หมวดหมู่เว็บ']) {
                    let cats = String(p['หมวดหมู่เว็บ']).split(',').map(c => c.trim()).filter(Boolean);
                    allCats.push(...cats);
                }
            });
            return [...new Set(allCats)];
        },
        // ดึงรายชื่อแบรนด์ที่ไม่ซ้ำ
        uniqueBrands() { 
            return [...new Set(this.products.map(p => p['แบรนด์']).filter(Boolean))]; 
        },
        // กรองสินค้าตามหมวดหมู่และแบรนด์
        filteredProducts() {
            return this.products.filter(p => {
                let matchCat = true;
                if (this.selectedCategory && p['หมวดหมู่เว็บ']) {
                    let productCats = String(p['หมวดหมู่เว็บ']).split(',').map(c => c.trim());
                    matchCat = productCats.includes(this.selectedCategory);
                } else if (this.selectedCategory && !p['หมวดหมู่เว็บ']) {
                    matchCat = false;
                }

                let matchBrand = this.selectedBrand ? p['แบรนด์'] === this.selectedBrand : true;
                return matchCat && matchBrand;
            });
        },
        // คำนวณยอดรวมในตะกร้า
        cartTotal() {
            return this.cart.reduce((total, item) => total + (this.getPrice(item.product) * item.qty), 0);
        }
    },
    mounted() {
        this.fetchProducts();
        // โหลดข้อมูลลูกค้าที่เคยพิมพ์ไว้จาก LocalStorage
        const savedCustomer = localStorage.getItem('mira_customer');
        if (savedCustomer) this.customer = JSON.parse(savedCustomer);
    },
    methods: {
        async fetchProducts() {
            try {
                const res = await fetch(`${this.apiUrl}?action=getProducts`);
                this.products = await res.json();
            } catch (err) { 
                console.error(err); 
                alert('ไม่สามารถโหลดข้อมูลสินค้าได้');
            }
            this.loading = false;
        },
        getPrice(product) {
            return (product['ราคาโปรโมชั่น'] && product['ราคาโปรโมชั่น'] > 0) ? product['ราคาโปรโมชั่น'] : product['Price'];
        },
        openProductModal(product) {
            this.selectedProduct = product;
            this.activeImage = product['รูป1'] || 'https://via.placeholder.com/400?text=No+Image';
        },
        addToCart(product) {
            const existing = this.cart.find(item => item.product['บาร์โค้ด'] === product['บาร์โค้ด']);
            if (existing) {
                existing.qty++; 
            } else {
                this.cart.push({ product, qty: 1 });
            }
            this.isCartOpen = true;
            if(this.selectedProduct) this.selectedProduct = null; // ปิดหน้าต่างรายละเอียดเมื่อกดลงตะกร้า
        },
        handleFileUpload(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => { this.slipBase64 = e.target.result; };
                reader.readAsDataURL(file);
            }
        },
        async checkout() {
            if(!this.customer.name || !this.customer.phone || !this.customer.address) return alert("กรุณากรอกข้อมูลให้ครบถ้วน");
            this.isCheckingOut = true;
            
            // จำข้อมูลไว้ใช้ครั้งหน้า
            localStorage.setItem('mira_customer', JSON.stringify(this.customer));

            const itemsText = this.cart.map(item => `${item.product['Name']} x ${item.qty}`).join(', ');
            const payload = {
                customerName: this.customer.name, phone: this.customer.phone,
                address: this.customer.address, items: itemsText, totalAmount: this.cartTotal,
                slipBase64: this.slipBase64
            };

            try {
                const response = await fetch(this.apiUrl, {
                    method: 'POST', body: JSON.stringify(payload),
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                });
                const result = await response.json();
                if(result.success) {
                    alert(`สั่งซื้อสำเร็จ! รหัสคำสั่งซื้อ: ${result.orderId}`);
                    this.cart = []; this.isCartOpen = false; this.slipBase64 = '';
                } else {
                    alert("เกิดข้อผิดพลาด: " + result.error);
                }
            } catch(error) { 
                alert("การสั่งซื้อขัดข้อง โปรดลองอีกครั้ง"); 
            }
            this.isCheckingOut = false;
        },
        async checkStatus() {
            if (!this.searchPhone.trim()) return alert("กรุณากรอกเบอร์โทร");
            try {
                const res = await fetch(`${this.apiUrl}?action=checkStatus&phone=${encodeURIComponent(this.searchPhone.trim())}`);
                this.orderStatuses = await res.json();
                if(this.orderStatuses.length === 0) alert("ไม่พบประวัติการสั่งซื้อด้วยเบอร์โทรนี้");
            } catch (error) { 
                alert("เกิดข้อผิดพลาดในการดึงข้อมูล"); 
            }
        },
        printWaybill(order) {
            this.printData = order; 
            
            // หน่วงเวลา 0.1 วินาที ให้ HTML เตรียมฟอร์มให้เสร็จก่อนปริ้น
            setTimeout(() => {
                const printSection = document.getElementById('print-section');
                if(printSection) {
                    printSection.style.display = 'block';
                    window.print(); 
                    printSection.style.display = 'none';
                }
            }, 100);
        }
    }
}).mount('#app');