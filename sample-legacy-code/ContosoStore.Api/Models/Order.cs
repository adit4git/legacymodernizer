using System.ComponentModel.DataAnnotations;

namespace ContosoStore.Api.Models;

public enum OrderStatus { Pending, Paid, Shipped, Delivered, Cancelled }

public class Order
{
    public int Id { get; set; }

    [Required] public string CustomerEmail { get; set; } = string.Empty;
    public DateTime PlacedAt { get; set; } = DateTime.UtcNow;
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public decimal TotalAmount { get; set; }
    public List<OrderItem> Items { get; set; } = new();
}

public class OrderItem
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public int ProductId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
}
