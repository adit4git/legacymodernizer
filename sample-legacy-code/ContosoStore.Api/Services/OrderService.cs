using ContosoStore.Api.Data;
using ContosoStore.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ContosoStore.Api.Services;

public interface IOrderService
{
    Task<Order?> GetAsync(int id);
    Task<Order> PlaceAsync(string email, IEnumerable<(int ProductId, int Qty)> lines);
    Task<Order?> UpdateStatusAsync(int id, OrderStatus status);
    Task<IEnumerable<Order>> ListForCustomerAsync(string email);
}

public class OrderService : IOrderService
{
    private readonly StoreDbContext _db;
    public OrderService(StoreDbContext db) => _db = db;

    public Task<Order?> GetAsync(int id) =>
        _db.Orders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == id);

    public Task<IEnumerable<Order>> ListForCustomerAsync(string email) =>
        _db.Orders.Include(o => o.Items)
                  .Where(o => o.CustomerEmail == email)
                  .OrderByDescending(o => o.PlacedAt)
                  .ToListAsync()
                  .ContinueWith(t => (IEnumerable<Order>)t.Result);

    public async Task<Order> PlaceAsync(string email, IEnumerable<(int ProductId, int Qty)> lines)
    {
        var order = new Order { CustomerEmail = email, Status = OrderStatus.Pending };
        decimal total = 0m;
        foreach (var (pid, qty) in lines)
        {
            var product = await _db.Products.FindAsync(pid)
                ?? throw new InvalidOperationException($"Product {pid} not found");
            if (product.StockQuantity < qty)
                throw new InvalidOperationException($"Insufficient stock for {product.Name}");
            product.StockQuantity -= qty;
            order.Items.Add(new OrderItem
            {
                ProductId = pid, Quantity = qty, UnitPrice = product.Price
            });
            total += product.Price * qty;
        }
        order.TotalAmount = total;
        _db.Orders.Add(order);
        await _db.SaveChangesAsync();
        return order;
    }

    public async Task<Order?> UpdateStatusAsync(int id, OrderStatus status)
    {
        var o = await _db.Orders.FindAsync(id);
        if (o is null) return null;
        o.Status = status;
        await _db.SaveChangesAsync();
        return o;
    }
}
